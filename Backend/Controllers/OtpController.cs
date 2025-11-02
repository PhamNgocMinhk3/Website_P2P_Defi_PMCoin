using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TradeFinanceBackend.Services;
using System.ComponentModel.DataAnnotations;
using TradeFinanceBackend.Application.Services;

namespace TradeFinanceBackend.Controllers
{
    [ApiController]
    [Route("api/otp")]
    [Authorize]
    public class OtpController : BaseApiController
    {
        private readonly IUserService _userService;

        public OtpController(IUserService userService)
        {
            _userService = userService;
        }

        public class SendOtpRequestDto
        {
            [Required]
            public string Purpose { get; set; } = string.Empty;
        }

        public class VerifyOtpRequestDto
        {
            [Required]
            public string Otp { get; set; } = string.Empty;
            [Required]
            public string Purpose { get; set; } = string.Empty;
        }

        [HttpPost("send")]
        public async Task<IActionResult> SendOtp([FromBody] SendOtpRequestDto request)
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized();
            }

            var result = await _userService.GenerateAndSendOtpAsync(userId, request.Purpose);

            return result.Success ? Ok(result) : BadRequest(result);
        }

        [HttpPost("verify")]
        public async Task<IActionResult> VerifyOtp([FromBody] VerifyOtpRequestDto request)
        {
            if (!TryGetCurrentUserId(out var userId))
            {
                return Unauthorized();
            }

            var result = await _userService.VerifyOtpAsync(userId, request.Otp, request.Purpose);

            return result.Success ? Ok(result) : BadRequest(result);
        }
    }
}