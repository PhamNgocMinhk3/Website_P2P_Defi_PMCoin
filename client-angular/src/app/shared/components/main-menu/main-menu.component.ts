import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService, User } from '../../../core/services/auth.service'; // Corrected path
import { Observable } from 'rxjs';
import { BellComponent } from '../Bell/bell.component';
import { UserSettingsService, UserSettings } from '../../services/user-settings.service';

interface MenuIcon {
  id: string;
  icon: string;
  label: string;
  route: string;
  position: 'left' | 'right';
  adminOnly?: boolean;
}

@Component({
  selector: 'app-main-menu',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, BellComponent],
  templateUrl: './main-menu.component.html',
  styleUrls: ['./main-menu.component.scss'],
})
export class MainMenuComponent {
  menuIcons: MenuIcon[] = [
    // Left side icons
    { id: 'chat', icon: '💬', label: 'Chat', route: '/chat', position: 'left' },
    {
      id: 'p2p',
      icon: '🔄',
      label: 'P2P Trading',
      route: '/p2p',
      position: 'left',
    },
    {
      id: 'game',
      icon: '🎮',
      label: 'Mini Game',
      route: '/game',
      position: 'left',
    },
    {
      id: 'analysis',
      icon: '🤖',
      label: 'Bot Analysis',
      route: '/analysis',
      position: 'left',
    },

    // Right side icons
    {
      id: 'dashboard',
      icon: '📊',
      label: 'Dashboard',
      route: '/dashboard',
      position: 'right',
    },
    {
      id: 'settings',
      icon: '⚙️',
      label: 'Settings',
      route: '/settings',
      position: 'right',
    },
    {
      id: 'admin',
      icon: '🔐',
      label: 'Admin Panel',
      route: '/game/admin/manager-game-hub',
      position: 'right',
      adminOnly: true,
    },
  ];

  public currentUser$: Observable<User | null>;
  public defaultAvatar = 'https://st3.depositphotos.com/6672868/13701/v/450/depositphotos_137014128-stock-illustration-user-profile-icon.jpg';
  public userSettings$: Observable<UserSettings | null>;

  constructor(
    private router: Router,
    private authService: AuthService,
    private userSettingsService: UserSettingsService // Inject the service
  ) {
    this.currentUser$ = this.authService.currentUser$;
    this.userSettings$ = this.userSettingsService.settings$;
  }

  getLeftIcons(): MenuIcon[] {
    return this.menuIcons.filter((icon) =>
      icon.position === 'left' && this.shouldShowIcon(icon)
    );
  }

  getRightIcons(): MenuIcon[] {
    return this.menuIcons.filter((icon) =>
      icon.position === 'right' && this.shouldShowIcon(icon)
    );
  }

  private shouldShowIcon(icon: MenuIcon): boolean {
    if (icon.adminOnly) {
      return this.authService.isAuthenticated && this.authService.isAdmin();
    }
    return true;
  }
}
