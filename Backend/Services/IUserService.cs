using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using TradeFinanceBackend.DTOs;
using TradeFinanceBackend.Models.DTOs;

namespace TradeFinanceBackend.Application.Services
{
    public interface IUserService
    {
        Task UpdateUserOnlineStatus(Guid userId, bool isOnline, DateTime? lastSeen = null);
        Task<ApiResponseDto<UserProfileDto>> GetProfileAsync(Guid userId);
        Task<ApiResponseDto<UserProfileDto>> UpdateProfileAsync(Guid userId, UpdateUserProfileDto updateDto);
        Task<ApiResponseDto<string>> UploadAvatarAsync(Guid userId, IFormFile file);
        Task<ApiResponseDto<UserSettingsDto>> GetSettingsAsync(Guid userId);
        Task<ApiResponseDto<UserSettingsDto>> UpdateSettingsAsync(Guid userId, UserSettingsDto settingsDto);
        Task<ApiResponseDto<bool>> ChangePasswordAsync(Guid userId, ChangePasswordDto changePasswordDto, string ipAddress);
        Task<ApiResponseDto<byte[]>> ExportSettingsAsync(Guid userId);
        Task<ApiResponseDto<bool>> ImportSettingsAsync(Guid userId, ImportSettingsDto importDto);
        Task<ApiResponseDto<List<LoginHistoryDto>>> GetLoginHistoryAsync(Guid userId, int page = 1, int pageSize = 20);
        Task LogLoginAsync(Guid userId, string ipAddress, string userAgent, bool isSuccessful, string? failureReason = null);
        Task<UserDto?> GetUserByIdAsync(Guid userId);
        Task<ApiResponseDto<bool>> ToggleEmailNotificationsAsync(Guid userId);
        Task<ApiResponseDto<List<UserSearchResultDto>>> SearchUsersAsync(string searchTerm, Guid currentUserId);
        Task<(bool Success, string Message, int StatusCode)> BlockUserAsync(Guid currentUserId, Guid userToBlockId);
        Task<(bool Success, string Message, int StatusCode)> UnblockUserAsync(Guid currentUserId, Guid userToUnblockId);
        Task<List<Guid>> GetBlockedUserIdsAsync(Guid currentUserId);
        Task<ApiResponseDto<bool>> GenerateAndSendOtpAsync(Guid userId, string purpose);
        Task<ApiResponseDto<bool>> VerifyOtpAsync(Guid userId, string otp, string purpose);
    }
}