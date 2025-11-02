using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
using Microsoft.Extensions.Options;
using TradeFinanceBackend.Models.Configuration;

namespace TradeFinanceBackend.Services
{
    public interface ICloudinaryService
    {
        Task<string> UploadImageAsync(IFormFile file, string folder = "avatars");
        Task<string> UploadFileAsync(IFormFile file, string folder = "documents");
        Task<bool> DeleteFileAsync(string publicId);
        string GetOptimizedImageUrl(string publicId, int width = 300, int height = 300);
    }

    public class CloudinaryService : ICloudinaryService
    {
        private readonly Cloudinary _cloudinary;
        private readonly CloudinarySettings _settings;
        private readonly ILogger<CloudinaryService> _logger;

        public CloudinaryService(IOptions<CloudinarySettings> settings, ILogger<CloudinaryService> logger)
        {
            _settings = settings.Value;
            _logger = logger;

            var account = new Account(
                _settings.CloudName,
                _settings.ApiKey,
                _settings.ApiSecret
            );

            _cloudinary = new Cloudinary(account);
        }

        public async Task<string> UploadImageAsync(IFormFile file, string folder = "avatars")
        {
            try
            {
                if (file == null || file.Length == 0)
                    throw new ArgumentException("File is empty or null");

                // Validate file type
                var allowedTypes = new[] { "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp" };
                if (!allowedTypes.Contains(file.ContentType.ToLower()))
                    throw new ArgumentException("Invalid file type. Only images are allowed.");

                // Validate file size (max 5MB)
                if (file.Length > 5 * 1024 * 1024)
                    throw new ArgumentException("File size too large. Maximum 5MB allowed.");

                using var stream = file.OpenReadStream();
                
                var uploadParams = new ImageUploadParams()
                {
                    File = new FileDescription(file.FileName, stream),
                    Folder = $"{_settings.Folder}/{folder}",
                    Transformation = new Transformation()
                        .Quality("auto")
                        .FetchFormat("auto")
                        .Width(800)
                        .Height(800)
                        .Crop("limit"),
                    PublicId = $"{folder}_{Guid.NewGuid()}"
                };

                var uploadResult = await _cloudinary.UploadAsync(uploadParams);

                if (uploadResult.Error != null)
                {
                    _logger.LogError("Cloudinary upload error: {Error}", uploadResult.Error.Message);
                    throw new Exception($"Upload failed: {uploadResult.Error.Message}");
                }

                return uploadResult.SecureUrl.ToString();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading image to Cloudinary");
                throw;
            }
        }

        public async Task<string> UploadFileAsync(IFormFile file, string folder = "documents")
        {
            try
            {
                if (file == null || file.Length == 0)
                    throw new ArgumentException("File is empty or null");

                // Validate file size (max 25MB to match frontend)
                if (file.Length > 25 * 1024 * 1024)
                    throw new ArgumentException("File size too large. Maximum 10MB allowed.");

                using var stream = file.OpenReadStream();
                
                var uploadParams = new RawUploadParams()
                {
                    File = new FileDescription(file.FileName, stream),
                    Folder = $"{_settings.Folder}/{folder}",
                    PublicId = $"{folder}_{Guid.NewGuid()}_{Path.GetFileNameWithoutExtension(file.FileName)}"
                };

                var uploadResult = await _cloudinary.UploadAsync(uploadParams);

                if (uploadResult.Error != null)
                {
                    _logger.LogError("Cloudinary upload error: {Error}", uploadResult.Error.Message);
                    throw new Exception($"Upload failed: {uploadResult.Error.Message}");
                }

                return uploadResult.SecureUrl.ToString();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading file to Cloudinary");
                throw;
            }
        }

        public async Task<bool> DeleteFileAsync(string publicId)
        {
            try
            {
                if (string.IsNullOrEmpty(publicId))
                    return false;

                var deleteParams = new DeletionParams(publicId);
                var result = await _cloudinary.DestroyAsync(deleteParams);

                return result.Result == "ok";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting file from Cloudinary: {PublicId}", publicId);
                return false;
            }
        }

        public string GetOptimizedImageUrl(string publicId, int width = 300, int height = 300)
        {
            try
            {
                if (string.IsNullOrEmpty(publicId))
                    return string.Empty;

                var transformation = new Transformation()
                    .Width(width)
                    .Height(height)
                    .Crop("fill")
                    .Quality("auto")
                    .FetchFormat("auto");

                return _cloudinary.Api.UrlImgUp.Transform(transformation).BuildUrl(publicId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating optimized image URL: {PublicId}", publicId);
                return string.Empty;
            }
        }
    }
}
