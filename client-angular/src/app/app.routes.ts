import { Routes } from '@angular/router';
import { ChatComponent } from './core/features/chat/chat.component';
import { HomeComponent } from './features/home/home.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { ForgotPasswordComponent } from './features/auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './features/auth/reset-password/reset-password.component';
import { VerifyEmailComponent } from './features/auth/verify-email/verify-email.component';
import { P2PComponent } from './features/p2p/p2p.component';
import { GameComponent } from './features/game/game.component';
import { AnalysisComponent } from './features/analysis/analysis.component';
import { SettingsComponent } from './features/settings/settings.component';
import { ManagerGameHubComponent } from './features/game/admin/manager-game-hub.component';
import { GameServerManagementComponent } from './features/game/admin/game-server-management.component';
import { SystemLogsComponent } from './features/game/admin/components/system-logs/system-logs.component';
import { QuicksellManagementComponent } from './features/game/admin/quicksell-management.component';
import { VndContractManagementComponent } from './features/game/admin/components/VND-payment/vnd-contract-management.component';
import { DebugComponent } from './features/debug/debug.component';
import { AuthGuard, NoAuthGuard } from './core/guards/auth.guard';
import { AdminGuard } from './core/guards/admin.guard';
import { PaymentReturnComponent } from './features/payment-return/payment-return.component';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },

  // Public routes (no authentication required)
  { path: 'home', component: HomeComponent },

  // Auth routes (redirect if already logged in)
  { path: 'login', component: LoginComponent, canActivate: [NoAuthGuard] },
  {
    path: 'register',
    component: RegisterComponent,
    canActivate: [NoAuthGuard],
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordComponent,
    canActivate: [NoAuthGuard],
  },
  {
    path: 'reset-password',
    component: ResetPasswordComponent,
    canActivate: [NoAuthGuard],
  },
  { path: 'verify-email', component: VerifyEmailComponent },

  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [AuthGuard],
  },
  { path: 'chat', component: ChatComponent, canActivate: [AuthGuard] },
  { path: 'call', loadComponent: () => import('./features/chat/pages/call-page/call-page.component').then(m => m.CallPageComponent), canActivate: [AuthGuard] },
  { path: 'p2p', component: P2PComponent, canActivate: [AuthGuard] },
  {
    path: 'game',
    children: [
      { path: '', redirectTo: 'play', pathMatch: 'full' },
      { path: 'play', component: GameComponent, canActivate: [AuthGuard] },
      {
        path: 'admin',
        canActivate: [AdminGuard],
        children: [
          { path: '', redirectTo: 'manager-game-hub', pathMatch: 'full' },
          { path: 'manager-game-hub', component: ManagerGameHubComponent },
          { path: 'contract-management', component: GameServerManagementComponent }, // This is for the Game contract
          { path: 'vnd-management', component: VndContractManagementComponent }, // New route for VND contract
          { path: 'quicksell-management', component: QuicksellManagementComponent }, // New route for QuickSell contract
          { path: 'logs', component: SystemLogsComponent }
        ]
      }
    ]
  },
  { path: 'analysis', component: AnalysisComponent, canActivate: [AuthGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [AuthGuard] },
  {
    path: 'payment-return',
    component: PaymentReturnComponent
  },
  // Debug route (temporary)
  { path: 'debug', component: DebugComponent },

  // Wildcard route - must be last
  { path: '**', redirectTo: '/home' },
];
