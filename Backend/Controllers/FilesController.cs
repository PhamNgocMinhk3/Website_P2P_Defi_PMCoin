
using Microsoft.AspNetCore.Mvc;
using TradeFinanceBackend.Services;

namespace TradeFinanceBackend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class FilesController : ControllerBase
    {
        private readonly ICloudinaryService _cloudinaryService;

        public FilesController(ICloudinaryService cloudinaryService)
        {
            _cloudinaryService = cloudinaryService;
        }

        [HttpPost("upload")]
        public async Task<IActionResult> UploadFile(IFormFile file)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest("File not selected or empty.");
            }

            try
            {
                string uploadUrl;

                if (file.ContentType.StartsWith("image/"))
                {
                    uploadUrl = await _cloudinaryService.UploadImageAsync(file, "images");
                }
                else
                {
                    uploadUrl = await _cloudinaryService.UploadFileAsync(file, "documents");
                }

                if (string.IsNullOrEmpty(uploadUrl))
                {
                    return StatusCode(500, "Failed to upload file to Cloudinary.");
                }

                // Return a structure that matches the frontend's `UploadedFile` interface
                var result = new { url = uploadUrl, fileName = file.FileName, fileSize = $"{file.Length / 1024.0:F2} KB", mimeType = file.ContentType };
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal server error: {ex.Message}");
            }
        }
    }
}
