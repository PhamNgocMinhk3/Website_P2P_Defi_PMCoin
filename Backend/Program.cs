using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using TradeFinanceBackend.Data;
using TradeFinanceBackend.Services;
using TradeFinanceBackend.Middleware;
using TradeFinanceBackend.Models.Configuration;
using TradeFinanceBackend;
using TradeFinanceBackend.Authentication;
using TradeFinanceBackend.Application.Services;
using TradeFinanceBackend.Hubs;
var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();

// Add SignalR
builder.Services.AddSignalR();

// Add CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngularApp", policy =>
    {
        policy.WithOrigins("http://localhost:4200")
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials(); // Important for cookies and SignalR
    });
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "Trade Finance Backend API",
        Version = "v1",
        Description = "API cho ứng dụng Backend Giao Thương mại với cơ sở dữ liệu PostgreSQL"
    });
});

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrEmpty(connectionString))
{
    throw new InvalidOperationException("Không tìm thấy chuỗi kết nối cơ sở dữ liệu 'DefaultConnection'.");
}

// Use scoped lifetime with connection pooling to avoid concurrency issues
builder.Services.AddDbContext<TradeFinanceDbContext>(options =>
    options.UseNpgsql(connectionString, npgsqlOptions =>
    {
        npgsqlOptions.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(5), errorCodesToAdd: null);
        npgsqlOptions.CommandTimeout(30);
    })
    .EnableSensitiveDataLogging(false)
    .EnableServiceProviderCaching()
    .EnableDetailedErrors(false), ServiceLifetime.Scoped);

// Configure settings
builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection("JwtSettings"));
builder.Services.Configure<MailSettings>(builder.Configuration.GetSection("MailSettings"));
builder.Services.Configure<CloudinarySettings>(builder.Configuration.GetSection("CloudinarySettings"));

// Register services
builder.Services.AddScoped<IDatabaseConnectionService, DatabaseConnectionService>();
builder.Services.AddScoped<IPasswordHashingService, PasswordHashingService>();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IAuthenticationService, AuthenticationService>();
builder.Services.AddScoped<ICloudinaryService, CloudinaryService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IUserBalanceService, UserBalanceService>();
builder.Services.AddScoped<ISmartContractLogService, SmartContractLogService>();
builder.Services.AddScoped<IChatService, ChatService>();

// P2P Trading services
builder.Services.AddScoped<IPriceCalculatorService, PriceCalculatorService>();
builder.Services.AddScoped<IBinancePriceService, BinancePriceService>();
builder.Services.AddScoped<IPMCoinPriceService, PMCoinPriceService>();

// SignalR services
builder.Services.AddScoped<TradeFinanceBackend.Services.ISignalRService, TradeFinanceBackend.Services.SignalRService>();
builder.Services.AddSingleton<PresenceTracker>();

// Daily Email Notification Services (New)
builder.Services.AddSingleton<IBackendBinanceApiService, BackendBinanceApiService>();
builder.Services.AddScoped<IDailyAnalysisNotificationService, DailyAnalysisNotificationService>();

// Game services
builder.Services.AddScoped<IAdvancedBotTradingService, AdvancedBotTradingService>();
builder.Services.AddScoped<IRealTimeBetAnalysisService, RealTimeBetAnalysisService>();
builder.Services.AddScoped<IGameSessionManagementService, GameSessionManagementService>();
builder.Services.AddScoped<ISmartContractPayoutService, SmartContractPayoutService>();
builder.Services.AddScoped<ISmartContractService, SmartContractService>();
builder.Services.AddSingleton<IOnDemandBotService, OnDemandBotService>();

// HttpClient for external APIs
builder.Services.AddHttpClient<IBinancePriceService, BinancePriceService>();

// Middleware services - SessionAuthenticationMiddleware is registered in pipeline, not DI

// Background services
builder.Services.AddHostedService<GameSessionManagementService>();
builder.Services.AddHostedService<DailyAnalysisScheduler>(); // New
// PMCoinBotService - BẬT LẠI để có biến động giá
builder.Services.AddHostedService<PMCoinBotService>();
builder.Services.AddHostedService<TradeFinanceBackend.Services.DailyProfitResetService>();

// Configure session-based authentication
builder.Services.AddAuthentication("SessionAuth")
    .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, SessionAuthenticationHandler>("SessionAuth", options => { });

// JWT Authentication temporarily disabled - using session-based auth instead
// var jwtSettings = builder.Configuration.GetSection("JwtSettings").Get<JwtSettings>();
// var key = Encoding.ASCII.GetBytes(jwtSettings?.SecretKey ?? throw new InvalidOperationException("JWT SecretKey Lỗi"));

// builder.Services.AddAuthentication(options =>
// {
//     options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
//     options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
// })
// .AddJwtBearer(options =>
// {
//     options.RequireHttpsMetadata = false;
//     options.SaveToken = true;
//     options.TokenValidationParameters = new TokenValidationParameters
//     {
//         ValidateIssuerSigningKey = true,
//         IssuerSigningKey = new SymmetricSecurityKey(key),
//         ValidateIssuer = true,
//         ValidIssuer = jwtSettings.Issuer,
//         ValidateAudience = true,
//         ValidAudience = jwtSettings.Audience,
//         ValidateLifetime = true,
//         ClockSkew = TimeSpan.Zero,
//         RequireExpirationTime = true
//     };

//     // Handle token from cookies
//     options.Events = new JwtBearerEvents
//     {
//         OnMessageReceived = context =>
//         {
//             var token = context.Request.Cookies["accessToken"];
//             if (!string.IsNullOrEmpty(token))
//             {
//                 context.Token = token;
//             }
//             return Task.CompletedTask;
//         },
//         OnAuthenticationFailed = context =>
//         {
//             // Log only in development
//             if (builder.Environment.IsDevelopment())
//             {
//                 Console.WriteLine($"JWT Authentication Failed: {context.Exception.Message}");
//             }
//             return Task.CompletedTask;
//         }
//     };
// });

// Add Authorization
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));
    options.AddPolicy("UserOrAdmin", policy => policy.RequireRole("User", "Admin"));
});

// Add logging
builder.Services.AddLogging(logging =>
{
    logging.AddConsole();
    logging.AddDebug();
});

var app = builder.Build();

app.Urls.Clear();
app.Urls.Add("http://localhost:5000");

// Test database connection on startup
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var startupLogger = services.GetRequiredService<ILogger<Program>>();

    try
    {
        var dbConnectionService = services.GetRequiredService<IDatabaseConnectionService>();

        // Test the connection
        var connectionSuccessful = await dbConnectionService.TestConnectionAsync();
        if (connectionSuccessful)
        {
            startupLogger.LogInformation("Database kết nối thành công");
            var connectionStatus = await dbConnectionService.GetConnectionStatusAsync();
            startupLogger.LogInformation("Database trạng thái: {Status}", connectionStatus);
        }
        else
        {
            startupLogger.LogWarning("Database kết nối thất bại");
        }
    }
    catch (Exception ex)
    {
        startupLogger.LogError(ex, "Database kết nối thất bại, lỗi: {Message}", ex.Message);
        // Don't stop the application, just log the error
    }
}

// Test database structure (only in development)
if (app.Environment.IsDevelopment())
{
    try
    {
        var testLogger = app.Services.GetRequiredService<ILogger<Program>>();
        await DatabaseTester.TestDatabaseConnection(testLogger);
    }
    catch (Exception ex)
    {
        var errorLogger = app.Services.GetRequiredService<ILogger<Program>>();
        errorLogger.LogError(ex, "Database structure test failed: {Message}", ex.Message);
    }
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Trade Finance Backend API v1");
        c.RoutePrefix = "swagger"; // Swagger UI will be available at /swagger
    });
}

// Only use HTTPS redirection in production
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseStaticFiles(); // For serving uploaded files (avatars, documents, etc.)

// Use CORS
app.UseCors("AllowAngularApp");

// Add Content Security Policy (CSP) middleware.
// This should be placed before other middleware that serves content, like UseRouting or UseStaticFiles.
app.Use(async (context, next) =>
{
    // Define a more permissive but still secure CSP.
    context.Response.Headers.Append(
        "Content-Security-Policy",
        "default-src 'self'; " +
        // Allow scripts from self, and also 'unsafe-inline' and 'unsafe-eval' for Angular's JIT compiler in development.
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        // Allow styles from self, inline styles, and Google Fonts.
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        // Allow fonts from self and Google Fonts.
        "font-src 'self' https://fonts.gstatic.com; " +
        // Allow images from various sources including Cloudinary, Giphy, and data URIs.
        "img-src 'self' data: https://res.cloudinary.com https://i.pravatar.cc https://st3.depositphotos.com https://media.giphy.com; " +
        // **THIS IS THE KEY FIX**: Explicitly allow media (audio/video) from Cloudinary.
        "media-src 'self' https://res.cloudinary.com; " + // Allow media from Cloudinary
        // Allow connections for API calls, WebSockets, and external services like Giphy.
        "connect-src 'self' http://localhost:5000 ws://localhost:5000 wss://stream.binance.com https://api.giphy.com https://res.cloudinary.com;"); // Allow connections to Cloudinary
    await next();
});

app.UseRouting();

// Add session-based authentication middleware
app.UseMiddleware<TradeFinanceBackend.Middleware.SessionAuthenticationMiddleware>();

// Enable Authentication and Authorization
app.UseAuthentication();
app.UseAuthorization();

// Map API controllers
app.MapControllers();

// Map SignalR Hub
app.MapHub<TradeFinanceBackend.Hubs.GameHub>("/gameHub");
app.MapHub<ChatHub>("/chatHub");
app.MapHub<PresenceHub>("/hubs/presence");

var logger = app.Services.GetRequiredService<ILogger<Program>>();
logger.LogInformation("Server chạy thành công");

app.Run();
