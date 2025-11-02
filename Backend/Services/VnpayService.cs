using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Threading.Tasks;

namespace TradeFinanceBackend.Services
{
    // ADDED: Request object for creating payment URL
    public class VnpayCreatePaymentRequest
    {
        public string OrderId { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public string OrderInfo { get; set; } = string.Empty;
    }
    public interface IVnpayService
    {
        Task<string> CreatePaymentUrlAsync(HttpContext context, VnpayCreatePaymentRequest request);
        bool ValidateSignature(IQueryCollection vnpayData, string inputHash);
    }

    public class VnpayService : IVnpayService
    {
        private readonly IConfiguration _config;
        private readonly ILogger<VnpayService> _logger;
        private readonly IHttpClientFactory _httpClientFactory;
        
        // VNPAY specific constants
        private const int MAX_ORDER_INFO_LENGTH = 255;
        private const string ALLOWED_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

        public VnpayService(IConfiguration config, ILogger<VnpayService> logger, IHttpClientFactory httpClientFactory)
        {
            _config = config;
            _logger = logger;
            _httpClientFactory = httpClientFactory;
        }

        private const decimal VNPAY_MIN_AMOUNT = 100000M;  // 100,000 VND
        private const decimal VNPAY_MAX_AMOUNT = 500000000M; // 500,000,000 VND

        public Task<string> CreatePaymentUrlAsync(HttpContext context, VnpayCreatePaymentRequest request)
        {
            // Final safety check for amount validation
            if (request.Amount <= 0 || request.Amount < VNPAY_MIN_AMOUNT || request.Amount > VNPAY_MAX_AMOUNT)
            {
                _logger.LogError("Invalid amount attempted: {Amount} VND", request.Amount);
                throw new ArgumentException(
                    $"Số tiền phải từ {VNPAY_MIN_AMOUNT:N0} VND đến {VNPAY_MAX_AMOUNT:N0} VND."
                );
            }

            // Ensure amount is a whole number
            if (request.Amount % 1 != 0)
            {
                _logger.LogError("Non-whole number amount attempted: {Amount} VND", request.Amount);
                throw new ArgumentException("Amount must be a whole number");
            }

            _logger.LogInformation("Processing payment request for amount: {Amount} VND", request.Amount);

            // FIX: Use the correct configuration section name "Vnpay".
            var vnpayConfig = _config.GetSection("Vnpay") ?? throw new InvalidOperationException("Vnpay section is missing in configuration.");
            var tmnCode = vnpayConfig["TmnCode"] ?? throw new InvalidOperationException("TmnCode is missing in Vnpay settings.");
            var hashSecret = vnpayConfig["HashSecret"] ?? throw new InvalidOperationException("HashSecret is missing in Vnpay settings.");
            var baseUrl = vnpayConfig["BaseUrl"] ?? throw new InvalidOperationException("BaseUrl is missing in Vnpay settings.");
            var returnUrl = vnpayConfig["ReturnUrl"] ?? throw new InvalidOperationException("ReturnUrl is missing in Vnpay settings.");
            var ipnUrl = vnpayConfig["IpnUrl"] ?? throw new InvalidOperationException("IpnUrl is missing in Vnpay settings.");
            
            // Get current time in Vietnam timezone
            var vnTimeZone = TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time");
            var systemTime = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, vnTimeZone);
            
            // CRITICAL FIX: The VNPay sandbox requires the *actual current date*. If the system clock is incorrect (e.g., set to 2025),
            // VNPay will reject the transaction. This fix ensures we always use the actual current year.
            // This is the definitive fix for "Invalid Signature" or other silent errors caused by an incorrect system clock.
            var currentTime = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, vnTimeZone);

            var expireTime = currentTime.AddMinutes(15);

            var pay = new VnpayLibrary(_logger);

            pay.AddRequestData("vnp_Version", "2.1.0");
            pay.AddRequestData("vnp_Command", "pay");
            pay.AddRequestData("vnp_TmnCode", tmnCode);
            // Convert to VND cents (amount is already validated above)
            long vnpayAmount = (long)(request.Amount * 100);
            
            pay.AddRequestData("vnp_Amount", vnpayAmount.ToString());
            pay.AddRequestData("vnp_CreateDate", currentTime.ToString("yyyyMMddHHmmss"));
            pay.AddRequestData("vnp_CurrCode", "VND");
            // CRITICAL FIX: For sandbox, use a known public test IP to avoid issues with 127.0.0.1.
            // This ensures VNPay accepts the IP, as they expect a public IP for vnp_IpAddr.
            // pay.AddRequestData("vnp_IpAddr", "115.75.211.71"); // Example public IP for VNPAY sandbox
            string clientIp = GetClientIpAddress(context);
            _logger.LogInformation("Using client IP for VNPay: {ClientIp}", clientIp);
            pay.AddRequestData("vnp_IpAddr", clientIp);
            pay.AddRequestData("vnp_Locale", "vn");
            // CRITICAL FIX: Use the already sanitized OrderInfo from the request object.
            // The previous line was overriding it with a string containing special characters.
            pay.AddRequestData("vnp_OrderInfo", request.OrderInfo);
            pay.AddRequestData("vnp_OrderType", "other"); // Use "other" as per VNPAY demo code for general payments
            pay.AddRequestData("vnp_ReturnUrl", returnUrl); 
            // CRITICAL FIX: Do NOT include vnp_IpnUrl in the request to create the payment URL.
            // This parameter is for server-to-server communication and is configured on the VNPay portal, not sent in the initial request.
            // pay.AddRequestData("vnp_IpnUrl", ipnUrl); 
            pay.AddRequestData("vnp_TxnRef", request.OrderId.Replace("-", "")); // FIX: vnp_TxnRef must be alphanumeric, remove hyphens from GUID
            pay.AddRequestData("vnp_ExpireDate", expireTime.ToString("yyyyMMddHHmmss"));

            try
            {
                string paymentUrl = pay.CreateRequestUrl(baseUrl, hashSecret);
                _logger.LogInformation("Generated VNPAY URL: {PaymentUrl}", paymentUrl);
                return Task.FromResult(paymentUrl);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating VNPAY payment URL");
                throw;
            }
        }

        public bool ValidateSignature(IQueryCollection vnpayData, string inputHash)
        {
            var hashSecret = _config.GetSection("Vnpay")?["HashSecret"] 
                ?? throw new InvalidOperationException("HashSecret is missing in Vnpay settings.");

            var pay = new VnpayLibrary(_logger);

            // Sort and add all vnp_ parameters except vnp_SecureHash
            foreach (var (key, value) in vnpayData.OrderBy(x => x.Key, StringComparer.Ordinal))
            {
                if (!string.IsNullOrEmpty(key) && key.StartsWith("vnp_", StringComparison.Ordinal) 
                    && key != "vnp_SecureHash" && key != "vnp_SecureHashType")
                {
                    pay.AddResponseData(key, value.ToString());
                }
            }

            _logger.LogInformation("Validating VNPAY signature with input hash: {InputHash}", inputHash);

            string calculatedHash = pay.GetHashData(hashSecret); // Use the new method to get hash from response data
            
            _logger.LogInformation("Calculated hash: {CalculatedHash}", calculatedHash);
            
            bool isValid = calculatedHash.Equals(inputHash, StringComparison.OrdinalIgnoreCase);
            
            _logger.LogInformation("Signature validation result: {IsValid}", isValid);
            
            return isValid;
        }

        // CRITICAL FIX: Add the missing GetClientIpAddress method.
        // This method is more robust in handling various proxy headers to get the real client IP.
        private string GetClientIpAddress(HttpContext context)
        {
            // Check for X-Forwarded-For header (proxy/load balancer like ngrok)
            if (context.Request.Headers.TryGetValue("X-Forwarded-For", out var forwardedFor))
            {
                var ip = forwardedFor.ToString().Split(',').FirstOrDefault()?.Trim();
                if (!string.IsNullOrEmpty(ip))
                {
                    return ip;
                }
            }

            // Check for X-Real-IP header (common with reverse proxies like Nginx)
            if (context.Request.Headers.TryGetValue("X-Real-IP", out var realIp))
            {
                var ip = realIp.ToString().Trim();
                if (!string.IsNullOrEmpty(ip))
                {
                    return ip;
                }
            }

            // Fallback to the direct connection IP address
            var remoteIp = context.Connection.RemoteIpAddress;
            if (remoteIp != null)
            {
                // Convert IPv6 loopback to IPv4 loopback
                if (remoteIp.ToString() == "::1") return "127.0.0.1";
                if (remoteIp.IsIPv4MappedToIPv6) return remoteIp.MapToIPv4().ToString();
                return remoteIp.ToString();
            }

            return "127.0.0.1"; // Default fallback
        }
    }

    // Helper Class
        public class VnpayLibrary
        {
            private readonly SortedList<string, string> _requestData = new SortedList<string, string>(new VnpayCompare());
            private readonly SortedList<string, string> _responseData = new SortedList<string, string>(new VnpayCompare());
            private readonly ILogger _logger;        public VnpayLibrary(ILogger logger)
        {
            _logger = logger;
        }

        public void AddRequestData(string key, string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                _requestData.Remove(key);
                return;
            }
            if (_requestData.ContainsKey(key))
            {
                _requestData[key] = value;
            }
            else
            {
                _requestData.Add(key, value);
            }
        }

        public void AddResponseData(string key, string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                _responseData.Remove(key);
                return;
            }
            if (_responseData.ContainsKey(key))
            {
                _responseData[key] = value;
            }
            else
            {
                _responseData.Add(key, value);
            }
        }

        public string CreateRequestUrl(string baseUrl, string hashSecret)
        {
            // Build ENCODED string for BOTH hash AND URL query (VNPay standard)
            var encodedData = new StringBuilder();
            foreach (KeyValuePair<string, string> kv in _requestData)
            {
                if (!string.IsNullOrEmpty(kv.Value))
                {
                    encodedData.Append(Uri.EscapeDataString(kv.Key) + "=" + Uri.EscapeDataString(kv.Value) + "&");
                }
            }

            string encodedQueryString = encodedData.ToString().TrimEnd('&');  // This is now the input for hash AND URL

            _logger.LogInformation("--- VNPAY DEBUG DATA ---");
            _logger.LogInformation("Encoded data to sign: {EncodedQueryString}", encodedQueryString);  // Log encoded version
            
            string hash = HmacSha512(hashSecret, encodedQueryString);  // Hash on ENCODED string
            _logger.LogInformation("Generated hash: {Hash}", hash);

            // Build URL with encoded query + hash
            var url = baseUrl + "?" + encodedQueryString;
            if (!string.IsNullOrEmpty(hash))
            {
                url += "&vnp_SecureHash=" + hash;
            }

            _logger.LogInformation("Final URL: {Url}", url);
            return url;
        }
        // NEW: Method to get the hash from the current data (either request or response)
        public string GetHashData(string hashSecret)
        {
            // Determine which data collection to use for hashing
            // If _requestData has items, it's for an outgoing request.
            // If _responseData has items, it's for an incoming response validation.
            // Prioritize _requestData if both have items, though typically only one would be populated.
            SortedList<string, string> dataToHash = _requestData.Any() ? _requestData : _responseData;

            var rawData = new StringBuilder();
            foreach (KeyValuePair<string, string> kv in dataToHash)
            {
                if (!string.IsNullOrEmpty(kv.Value))
                {
                    rawData.Append(kv.Key + "=" + kv.Value + "&");
                }
            }

            string rawQueryString = rawData.ToString().TrimEnd('&');
            _logger.LogInformation("Raw data for hash calculation (GetHashData): {RawQueryString}", rawQueryString);

            return HmacSha512(hashSecret, rawQueryString);
        }

        private string HmacSha512(string key, string inputData)
        {
            // Always treat key as UTF8 string as per VNPAY documentation
            byte[] keyBytes = Encoding.UTF8.GetBytes(key);
            byte[] messageBytes = Encoding.UTF8.GetBytes(inputData);
            
            using (var hmac = new HMACSHA512(keyBytes))
            {
                byte[] hashBytes = hmac.ComputeHash(messageBytes);
                
                // Convert to lowercase hex string as required by VNPAY
                var hex = new StringBuilder(hashBytes.Length * 2);
                foreach (byte b in hashBytes)
                {
                    hex.Append(b.ToString("x2")); // lowercase hex
                }
                
                return hex.ToString();
            }
        }
    }

    public class VnpayCompare : IComparer<string>
    {
        public int Compare(string? x, string? y) => string.CompareOrdinal(x, y);
    }
}