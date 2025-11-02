using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using TradeFinanceBackend.Data;
using TradeFinanceBackend.Models;

namespace TradeFinanceBackend.Services
{
    public class DailyAnalysisScheduler : IHostedService, IDisposable
    {
        private readonly ILogger<DailyAnalysisScheduler> _logger;
        private readonly IServiceProvider _serviceProvider;
        private Timer? _timer;
        private const string JobName = "DailyAnalysisEmailJob";
        private const int RunHourUtc = 7; // 7 AM UTC

        public DailyAnalysisScheduler(ILogger<DailyAnalysisScheduler> logger, IServiceProvider serviceProvider)
        {
            _logger = logger;
            _serviceProvider = serviceProvider;
        }

        public Task StartAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("Daily Analysis Email Scheduler is starting.");
            // Check every hour
            _timer = new Timer(DoWork, null, TimeSpan.Zero, TimeSpan.FromHours(1));
            return Task.CompletedTask;
        }

        private async void DoWork(object? state)
        {
            var now = DateTime.UtcNow;
            if (now.Hour != RunHourUtc)
            {
                // It's not time to run yet, do nothing.
                return;
            }

            _logger.LogInformation("[{JobName}] - It's time to check for daily analysis email job.", JobName);

            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

            var lastExecution = await context.JobExecutionLogs.FirstOrDefaultAsync(j => j.JobName == JobName);

            if (lastExecution != null && lastExecution.LastExecutionDate.Date == now.Date)
            {
                _logger.LogInformation("[{JobName}] - Job has already run today on {ExecutionDate}. Skipping.", JobName, lastExecution.LastExecutionDate);
                return;
            }

            _logger.LogInformation("[{JobName}] - Job has not run today. Executing now...", JobName);

            try
            {
                var notificationService = scope.ServiceProvider.GetRequiredService<IDailyAnalysisNotificationService>();
                await notificationService.SendAnalysisToSubscribedUsersAsync();

                // Update the log after successful execution
                if (lastExecution == null)
                {
                    lastExecution = new JobExecutionLog { JobName = JobName };
                    context.JobExecutionLogs.Add(lastExecution);
                }
                lastExecution.LastExecutionDate = now;
                await context.SaveChangesAsync();

                _logger.LogInformation("[{JobName}] - Job executed successfully and log has been updated.", JobName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[{JobName}] - An error occurred while executing the job.", JobName);
            }
        }

        public Task StopAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("Daily Analysis Email Scheduler is stopping.");
            _timer?.Change(Timeout.Infinite, 0);
            return Task.CompletedTask;
        }

        public void Dispose()
        {
            _timer?.Dispose();
        }
    }
}
