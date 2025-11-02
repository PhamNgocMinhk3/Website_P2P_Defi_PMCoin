using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;
using TradeFinanceBackend.Models.Configuration;

namespace TradeFinanceBackend.Services
{
    public interface IEmailService
    {
        Task<bool> SendEmailVerificationAsync(string email, string verificationToken, string firstName = "");
        Task<bool> SendPasswordResetAsync(string email, string resetToken, string firstName = "");
        Task<bool> SendWelcomeEmailAsync(string email, string firstName = "");
        Task<bool> SendEmailAsync(string to, string subject, string htmlBody, string? plainTextBody = null);
    }

    public class EmailService : IEmailService
    {
        private readonly MailSettings _mailSettings;
        private readonly ILogger<EmailService> _logger;

        public EmailService(IOptions<MailSettings> mailSettings, ILogger<EmailService> logger)
        {
            _mailSettings = mailSettings.Value;
            _logger = logger;
        }

        public async Task<bool> SendEmailVerificationAsync(string email, string verificationToken, string firstName = "")
        {
            var subject = "Verify Your Email - Trade Finance System";
            var verificationUrl = $"http://localhost:4200/verify-email?token={verificationToken}&email={Uri.EscapeDataString(email)}";
            
            var htmlBody = $@"
                <html>
                <body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333;'>
                    <div style='max-width: 600px; margin: 0 auto; padding: 20px;'>
                        <h2 style='color: #2c3e50;'>Welcome to Trade Finance System!</h2>
                        <p>Hello {(!string.IsNullOrEmpty(firstName) ? firstName : "")},</p>
                        <p>Thank you for registering with Trade Finance System. Please verify your email address by clicking the button below:</p>
                        <div style='text-align: center; margin: 30px 0;'>
                            <a href='{verificationUrl}' style='background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;'>Verify Email</a>
                        </div>
                        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                        <p style='word-break: break-all; color: #7f8c8d;'>{verificationUrl}</p>
                        <p><strong>This verification link will expire in 24 hours.</strong></p>
                        <hr style='border: none; border-top: 1px solid #eee; margin: 30px 0;'>
                        <p style='font-size: 12px; color: #7f8c8d;'>
                            If you didn't create an account with Trade Finance System, please ignore this email.
                        </p>
                    </div>
                </body>
                </html>";

            var plainTextBody = $@"
                Welcome to Trade Finance System!
                
                Hello {(!string.IsNullOrEmpty(firstName) ? firstName : "")},
                
                Thank you for registering with Trade Finance System. Please verify your email address by visiting:
                {verificationUrl}
                
                This verification link will expire in 24 hours.
                
                If you didn't create an account with Trade Finance System, please ignore this email.";

            return await SendEmailAsync(email, subject, htmlBody, plainTextBody);
        }

        public async Task<bool> SendPasswordResetAsync(string email, string resetToken, string firstName = "")
        {
            var subject = "Password Reset - Trade Finance System";
            var resetUrl = $"http://localhost:4200/reset-password?token={resetToken}";
            
            var htmlBody = $@"
                <html>
                <body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333;'>
                    <div style='max-width: 600px; margin: 0 auto; padding: 20px;'>
                        <h2 style='color: #e74c3c;'>Password Reset Request</h2>
                        <p>Hello {(!string.IsNullOrEmpty(firstName) ? firstName : "")},</p>
                        <p>We received a request to reset your password for your Trade Finance System account.</p>
                        <div style='text-align: center; margin: 30px 0;'>
                            <a href='{resetUrl}' style='background-color: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;'>Reset Password</a>
                        </div>
                        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                        <p style='word-break: break-all; color: #7f8c8d;'>{resetUrl}</p>
                        <p><strong>This reset link will expire in 5 minutes for security reasons.</strong></p>
                        <hr style='border: none; border-top: 1px solid #eee; margin: 30px 0;'>
                        <p style='font-size: 12px; color: #7f8c8d;'>
                            If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
                        </p>
                    </div>
                </body>
                </html>";

            var plainTextBody = $@"
                Password Reset Request
                
                Hello {(!string.IsNullOrEmpty(firstName) ? firstName : "")},
                
                We received a request to reset your password for your Trade Finance System account.
                
                Please visit the following link to reset your password:
                {resetUrl}
                
                This reset link will expire in 5 minutes for security reasons.
                
                If you didn't request a password reset, please ignore this email. Your password will remain unchanged.";

            return await SendEmailAsync(email, subject, htmlBody, plainTextBody);
        }

        public async Task<bool> SendWelcomeEmailAsync(string email, string firstName = "")
        {
            var subject = "Welcome to Trade Finance System!";
            
            var htmlBody = $@"
                <html>
                <body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333;'>
                    <div style='max-width: 600px; margin: 0 auto; padding: 20px;'>
                        <h2 style='color: #27ae60;'>Welcome to Trade Finance System!</h2>
                        <p>Hello {(!string.IsNullOrEmpty(firstName) ? firstName : "")},</p>
                        <p>Your email has been successfully verified and your account is now active!</p>
                        <p>You can now access all features of the Trade Finance System:</p>
                        <ul>
                            <li>Dashboard and Analytics</li>
                            <li>P2P Trading</li>
                            <li>Game Features</li>
                            <li>And much more!</li>
                        </ul>
                        <div style='text-align: center; margin: 30px 0;'>
                            <a href='http://localhost:4200/login' style='background-color: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;'>Login to Your Account</a>
                        </div>
                        <p>Thank you for choosing Trade Finance System!</p>
                    </div>
                </body>
                </html>";

            return await SendEmailAsync(email, subject, htmlBody);
        }

        public async Task<bool> SendEmailAsync(string to, string subject, string htmlBody, string? plainTextBody = null)
        {
            try
            {
                var message = new MimeMessage();
                message.From.Add(new MailboxAddress(_mailSettings.DisplayName, _mailSettings.Email));
                message.To.Add(new MailboxAddress("", to));
                message.Subject = subject;

                var bodyBuilder = new BodyBuilder();
                
                if (!string.IsNullOrEmpty(plainTextBody))
                {
                    bodyBuilder.TextBody = plainTextBody;
                }
                
                bodyBuilder.HtmlBody = htmlBody;
                message.Body = bodyBuilder.ToMessageBody();

                using var client = new SmtpClient();
                await client.ConnectAsync(_mailSettings.Host, _mailSettings.Port, SecureSocketOptions.StartTls);
                await client.AuthenticateAsync(_mailSettings.Email, _mailSettings.Password);
                await client.SendAsync(message);
                await client.DisconnectAsync(true);

                _logger.LogInformation("Email sent successfully to {Email}", to);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send email to {Email}: {Message}", to, ex.Message);
                return false;
            }
        }
    }
}
