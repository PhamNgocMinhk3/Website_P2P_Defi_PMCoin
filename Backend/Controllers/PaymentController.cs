using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.Linq;
using System.Threading.Tasks;
using TradeFinanceBackend.Data;
using TradeFinanceBackend.Models;
using Microsoft.EntityFrameworkCore;
using TradeFinanceBackend.Services;
using System.ComponentModel.DataAnnotations;

namespace TradeFinanceBackend.Controllers
{
    public class CreatePaymentRequest
    {
        private const decimal MIN_AMOUNT = 100000M;  // 100,000 VND
        private const decimal MAX_AMOUNT = 500000000M; // 500,000,000 VND

        private decimal _amount;
        
        [Required(ErrorMessage = "Vui lòng nhập số tiền.")]
        [Range(typeof(decimal), "100000", "500000000", ErrorMessage = "Số tiền phải từ 100.000 VND đến 500.000.000 VND.")]
        public decimal Amount 
        { 
            get => _amount;
            set
            {
                // Ensure amount is within VNPAY sandbox limits
                if (value < MIN_AMOUNT || value > MAX_AMOUNT)
                {
                    throw new ArgumentException($"Số tiền phải từ {MIN_AMOUNT:N0} VND đến {MAX_AMOUNT:N0} VND.");
                }
                
                // Ensure amount is a whole number
                if (value % 1 != 0)
                {
                    throw new ArgumentException("Số tiền phải là số nguyên");
                }

                _amount = value;
            }
        }

        public override string ToString()
        {
            return $"CreatePaymentRequest: Amount={Amount:N0} VND";
        }
    }

    // ADDED: DTO for withdrawal request from user
    public class RequestWithdrawalPayload
    {
        [Required]
        [Range(100000, 500000000, ErrorMessage = "Số tiền rút phải từ 100,000 VND đến 500,000,000 VND.")]
        public decimal Amount { get; set; }
        [Required]
        public string BankName { get; set; } = string.Empty;
        [Required]
        public string AccountNumber { get; set; } = string.Empty;
        [Required]
        public string AccountName { get; set; } = string.Empty;
        [Required]
        [StringLength(66, MinimumLength = 66, ErrorMessage = "Transaction hash không hợp lệ.")]
        public string TransactionHash { get; set; } = string.Empty;
    }

    [ApiController]
    [Route("api/[controller]")]
    public class PaymentController : BaseApiController
    {
        private readonly IVnpayService _vnpayService;
        private readonly ILogger<PaymentController> _logger;
        private readonly TradeFinanceDbContext _context;
        private readonly IPaymentProcessingService _paymentProcessingService;
        private readonly ISmartContractService _smartContractService; // ADDED

        public PaymentController(IVnpayService vnpayService, ILogger<PaymentController> logger, TradeFinanceDbContext context, IPaymentProcessingService paymentProcessingService, ISmartContractService smartContractService)
        {
            _vnpayService = vnpayService;
            _logger = logger;
            _context = context;
            _paymentProcessingService = paymentProcessingService;
            _smartContractService = smartContractService; // ADDED
        }

        [Authorize]
        [HttpPost("create-vnpay-url")]
        public async Task<IActionResult> CreateVnpayUrl([FromBody] CreatePaymentRequest request)
        {
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();

            if (!ModelState.IsValid)
            {
                return BadRequest(new 
                { 
                    message = "Invalid amount. Must be between 10,000 VND and 100,000 VND for VNPAY sandbox testing",
                    errors = ModelState.Values
                        .SelectMany(v => v.Errors)
                        .Select(e => e.ErrorMessage)
                        .ToList()
                });
            }

            try
            {
                // Validate amount (this will throw if invalid)
                _ = request.Amount;

                // 1. Create a PENDING deposit transaction
                var depositRequest = new FiatTransaction
                {
                    // CRITICAL FIX: Use the generated shortRefId as the primary reference for this transaction.
                    PaymentGatewayRef = new Random().Next(100000, 999999).ToString() + DateTime.UtcNow.Millisecond.ToString(),
                    UserId = userId,
                    Amount = request.Amount,
                    Type = "DEPOSIT",
                    Status = "PENDING",
                    CreatedAt = DateTime.UtcNow
                };

                _context.FiatTransactions.Add(depositRequest);
                await _context.SaveChangesAsync();

                // 2. Create VNPAY payment URL with simplified parameters
                var vnpayRequest = new VnpayCreatePaymentRequest
                {
                    OrderId = depositRequest.PaymentGatewayRef, // Use the saved reference ID
                    Amount = request.Amount,
                    // CRITICAL FIX: vnp_OrderInfo must be strictly alphanumeric (no spaces, no special characters like ':').
                    OrderInfo = $"ThanhtoanGD{depositRequest.PaymentGatewayRef}"
                };
                var paymentUrl = await _vnpayService.CreatePaymentUrlAsync(HttpContext, vnpayRequest);

                return Ok(new { paymentUrl });
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating VNPAY payment URL");
                return StatusCode(500, new { message = "An error occurred while processing your payment request" });
            }
        }

        [Authorize]
        [HttpPost("request-withdrawal")]
        public async Task<IActionResult> RequestWithdrawal([FromBody] RequestWithdrawalPayload payload)
        {
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();

            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            try
            {
                // Create a new FiatTransaction with type WITHDRAWAL and status PENDING_ADMIN_APPROVAL
                var withdrawalRequest = new FiatTransaction
                {
                    UserId = userId,
                    Amount = payload.Amount,
                    Type = "WITHDRAWAL",
                    Status = "PENDING_ADMIN_APPROVAL", // New status for admin to see
                    CreatedAt = DateTime.UtcNow,
                    TransactionHash = payload.TransactionHash, // On-chain lock transaction
                    // Store bank info for admin processing
                    BankName = payload.BankName,
                    BankAccountNumber = payload.AccountNumber,
                    BankAccountName = payload.AccountName
                };

                _context.FiatTransactions.Add(withdrawalRequest);
                await _context.SaveChangesAsync();

                return Ok(new { success = true, message = "Yêu cầu rút tiền đã được gửi thành công." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating withdrawal request for user {UserId}", userId);
                return StatusCode(500, new { message = "Đã xảy ra lỗi khi tạo yêu cầu rút tiền." });
            }
        }

        [Authorize(Roles = "Admin")]
        [HttpPost("transactions/{id}/approve-withdrawal")]
        public async Task<IActionResult> ApproveWithdrawal(Guid id)
        {
            var transaction = await _context.FiatTransactions.FirstOrDefaultAsync(t => t.Id == id && t.Type == "WITHDRAWAL" && t.Status == "PENDING_ADMIN_APPROVAL");

            if (transaction == null)
            {
                return NotFound(new { message = "Không tìm thấy yêu cầu rút tiền hợp lệ." });
            }

            try
            {
                // CRITICAL FIX: After manual bank transfer is confirmed, the locked tokens
                // must be transferred from the Treasury contract back to the admin's main wallet
                // to complete the off-ramp cycle.
                _logger.LogInformation("Admin approved withdrawal {TransactionId}. Claiming {Amount} VNDT from Treasury contract.", id, transaction.Amount);
                
                // Call the new service method to execute the on-chain claim
                var claimTxHash = await _smartContractService.ClaimWithdrawalAsync(transaction.Amount);

                transaction.Status = "COMPLETED";
                transaction.UpdatedAt = DateTime.UtcNow;
                // Optionally, store the claim transaction hash in a new field if needed for auditing.
                await _context.SaveChangesAsync();

                _logger.LogInformation("✅ Withdrawal request {TransactionId} completed. Claim TxHash: {ClaimTxHash}", id, claimTxHash);
                return Ok(new { message = "Yêu cầu rút tiền đã được phê duyệt và token đã được thu hồi thành công." });
            }
            catch (Exception ex)
            {
                _logger.LogCritical(ex, "CRITICAL FAILURE: Failed to claim locked tokens for approved withdrawal {TransactionId}. Please check manually.", id);
                return StatusCode(500, new { message = "LỖI NGHIÊM TRỌNG: Không thể thu hồi token trên blockchain. Vui lòng kiểm tra thủ công." });
            }
        }

        [Authorize(Roles = "Admin")]
        [HttpPost("transactions/{id}/reject-withdrawal")]
        public async Task<IActionResult> RejectWithdrawal(Guid id)
        {
            var transaction = await _context.FiatTransactions
                .Include(t => t.User)
                .ThenInclude(u => u.UserProfile)
                .FirstOrDefaultAsync(t => t.Id == id && t.Type == "WITHDRAWAL" && t.Status == "PENDING_ADMIN_APPROVAL");

            if (transaction == null)
            {
                return NotFound(new { message = "Không tìm thấy yêu cầu rút tiền hợp lệ." });
            }

            if (transaction.User?.UserProfile?.WalletCode == null)
            {
                 _logger.LogError("Cannot reject withdrawal {TransactionId}: User or wallet address is missing.", id);
                 return StatusCode(500, new { message = "Không thể hoàn tiền: thiếu thông tin người dùng." });
            }

            try
            {
                // CRITICAL: Call smart contract to refund the locked tokens back to the user.
                await _smartContractService.RefundWithdrawalAsync(transaction.User.UserProfile.WalletCode, transaction.Amount);

                transaction.Status = "REJECTED";
                transaction.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                _logger.LogWarning("Admin rejected withdrawal request {TransactionId}. Amount was refunded to user.", id);
                return Ok(new { message = "Yêu cầu rút tiền đã bị từ chối và tiền đã được hoàn lại cho người dùng." });
            }
            catch (Exception ex)
            {
                _logger.LogCritical(ex, "CRITICAL FAILURE: Failed to refund user {UserId} for rejected withdrawal {TransactionId}. Please check manually.", transaction.UserId, id);
                return StatusCode(500, new { message = "LỖI NGHIÊM TRỌNG: Không thể hoàn tiền cho người dùng trên blockchain. Vui lòng kiểm tra thủ công." });
            }
        }

        // This endpoint is called by VNPay's server (server-to-server). It's not for users.
        // Therefore, it should not have the [Authorize] attribute.
        [HttpGet("vnpay-ipn")]
        public async Task<IActionResult> VnpayIpn()
        {
            // According to VNPay documentation, we must return a JSON response.
            // We'll prepare a ContentResult with the correct content type.
            Func<string, string, ContentResult> vnpayResponse = (code, message) =>
            {
                var response = new { RspCode = code, Message = message };
                return Content(System.Text.Json.JsonSerializer.Serialize(response), "application/json");
            };

            try
            {
                var vnpayData = HttpContext.Request.Query;
                var vnpSecureHash = vnpayData.FirstOrDefault(p => p.Key == "vnp_SecureHash").Value.ToString();

                // 1. Validate Signature
                if (string.IsNullOrEmpty(vnpSecureHash) || !_vnpayService.ValidateSignature(vnpayData, vnpSecureHash))
                {
                    _logger.LogError("VNPay IPN: Invalid signature. Request: {Query}", HttpContext.Request.QueryString);
                    return vnpayResponse("97", "Invalid Signature"); // Invalid signature
                }

                // 2. Get essential data from VNPay's response
                var vnp_TxnRef = vnpayData.FirstOrDefault(p => p.Key == "vnp_TxnRef").Value.ToString();
                var vnp_ResponseCode = vnpayData.FirstOrDefault(p => p.Key == "vnp_ResponseCode").Value.ToString();
                var vnp_TransactionStatus = vnpayData.FirstOrDefault(p => p.Key == "vnp_TransactionStatus").Value.ToString();
                var vnp_AmountString = vnpayData.FirstOrDefault(p => p.Key == "vnp_Amount").Value.ToString();

                // 3. Find the original transaction in our database using vnp_TxnRef
                // CRITICAL FIX: Find the transaction using the dedicated PaymentGatewayRef field.
                var depositRequest = await _context.FiatTransactions
                    .FirstOrDefaultAsync(t => t.PaymentGatewayRef == vnp_TxnRef);

                if (depositRequest == null)
                {
                    _logger.LogWarning("VNPay IPN: Order not found for vnp_TxnRef {TxnRef}", vnp_TxnRef);
                    return vnpayResponse("01", "Order not found");
                }

                // 4. Idempotency Check: Check if the transaction has already been completed or failed.
                // If so, we just confirm success to VNPay to stop them from retrying.
                if (depositRequest.Status != "PENDING")
                {
                    _logger.LogInformation("VNPay IPN: Order {OrderId} already processed with status {Status}. Acknowledging to VNPay.", depositRequest.Id, depositRequest.Status);
                    return vnpayResponse("02", "Order already confirmed");
                }

                // 5. Amount Validation: Check if the amount from VNPay matches our records.
                // VNPay returns amount in cents, so we divide by 100.
                if (long.TryParse(vnp_AmountString, out var vnpAmount) && (vnpAmount / 100) != depositRequest.Amount)
                {
                    _logger.LogError("VNPay IPN: Amount mismatch for Order {OrderId}. Expected: {ExpectedAmount}, Received: {ReceivedAmount}",
                        depositRequest.Id, depositRequest.Amount, vnpAmount / 100);
                    depositRequest.Status = "FAILED_AMOUNT_MISMATCH";
                    await _context.SaveChangesAsync();
                    return vnpayResponse("04", "Invalid amount");
                }

                // 6. Transaction Status Check: Process based on VNPay's transaction status.
                // vnp_ResponseCode and vnp_TransactionStatus must both be "00" for a successful transaction.
                if (vnp_ResponseCode == "00" && vnp_TransactionStatus == "00")
                {
                    _logger.LogInformation("VNPay IPN: Successful payment for Order {OrderId}. Processing deposit.", depositRequest.Id);
                    
                    // Delegate the business logic to the processing service
                    bool processingResult = await _paymentProcessingService.ProcessSuccessfulDepositAsync(depositRequest.Id);
                    
                    if (processingResult)
                    {
                        _logger.LogInformation("VNPay IPN: Successfully processed and credited for Order {OrderId}.", depositRequest.Id);
                        return vnpayResponse("00", "Confirm Success");
                    }
                    else
                    {
                        // The processing service failed, but the payment was valid.
                        // We tell VNPay it's successful to prevent retries, but our internal status reflects the failure.
                        _logger.LogError("VNPay IPN: Internal processing failed for Order {OrderId}, but acknowledging to VNPay.", depositRequest.Id);
                        return vnpayResponse("00", "Confirm Success");
                    }
                }
                else
                {
                    // Payment failed at VNPay's end. Update our transaction status.
                    _logger.LogWarning("VNPay IPN: Payment failed for Order {OrderId}. ResponseCode: {ResponseCode}, TransactionStatus: {TransactionStatus}", 
                        depositRequest.Id, vnp_ResponseCode, vnp_TransactionStatus);
                    depositRequest.Status = "FAILED_VNPAY";
                    await _context.SaveChangesAsync();
                    return vnpayResponse("00", "Confirm Success"); // Still confirm to VNPay to stop retries.
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unhandled exception occurred in VnpayIpn.");
                // In case of a critical server error, tell VNPay something went wrong.
                // This might trigger their retry mechanism, which is okay in this scenario.
                return vnpayResponse("99", "Input data required or internal error");
            }
        }

        [Authorize(Roles = "Admin")]
        [HttpGet("transactions")]
        public async Task<IActionResult> GetFiatTransactions([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 1;
            if (pageSize > 100) pageSize = 100; // Giới hạn kích thước trang tối đa

            var query = _context.FiatTransactions
                .Include(t => t.User) // Tải kèm thông tin người dùng để hiển thị
                .AsNoTracking();

            var totalCount = await query.CountAsync();

            var transactions = await query
                .OrderByDescending(t => t.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var response = new
            {
                TotalCount = totalCount,
                Page = page,
                PageSize = pageSize,
                TotalPages = (int)Math.Ceiling(totalCount / (double)pageSize),
                Data = transactions
            };

            return Ok(response);
        }
    }
}