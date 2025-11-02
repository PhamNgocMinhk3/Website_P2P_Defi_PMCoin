import {
  Component,
  Output,
  EventEmitter,
  OnInit,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';

export interface QuickAction {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: 'primary' | 'secondary' | 'tertiary' | 'quaternary' | 'success';
  route?: string;
  action?: string;
}

@Component({
  selector: 'app-quick-actions',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './quick-actions.component.html',
  styleUrls: ['./quick-actions.component.scss'],
})
export class QuickActionsComponent implements OnInit, AfterViewInit {
  @Output() actionClicked = new EventEmitter<QuickAction>();

  quickActions: QuickAction[] = [
    {
      id: 'chat',
      title: 'Trò Chuyện',
      subtitle: 'Chat Real-time',
      icon: '💬',
      color: 'primary',
      route: '/chat',
      action: 'openChat',
    },
    {
      id: 'p2p-trading',
      title: 'Tạo Giao Dịch Mới',
      subtitle: 'P2P Trading',
      icon: '🔄',
      color: 'secondary',
      route: '/p2p',
      action: 'createTransaction',
    },
    {
      id: 'mini-game',
      title: 'Chơi Game Dự Đoán',
      subtitle: 'Up & Down',
      icon: '🎮',
      color: 'tertiary',
      route: '/game',
      action: 'playGame',
    },
    {
      id: 'bot-analysis',
      title: 'Xem Phân Tích',
      subtitle: 'Bot AI',
      icon: '🤖',
      color: 'success',
      route: '/analysis',
      action: 'openAnalysis',
    },
    {
      id: 'settings',
      title: 'Cài Đặt',
      subtitle: 'Tài khoản',
      icon: '⚙️',
      color: 'quaternary',
      route: '/settings',
      action: 'openSettings',
    },
  ];

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Component initialization
  }

  ngAfterViewInit(): void {
    this.setupAnimations();
  }

  private setupAnimations(): void {
    if (typeof window !== 'undefined' && (window as any).gsap) {
      const gsap = (window as any).gsap;

      // Animate quick action buttons on load
      gsap.from('.quick-action-btn', {
        duration: 0.6,
        y: 30,
        opacity: 0,
        stagger: 0.1,
        ease: 'power2.out',
        delay: 0.3,
      });
    }
  }

  onActionClick(action: QuickAction): void {
    // Emit the action to parent component
    this.actionClicked.emit(action);

    // Add click animation
    this.animateClick(action.id);

    // Handle navigation or action
    if (action.route) {
      // Navigate to route
      this.router.navigate([action.route]);
    }

    if (action.action) {
      // Execute action
      // TODO: Implement specific actions
    }
  }

  private animateClick(actionId: string): void {
    if (typeof window !== 'undefined' && (window as any).gsap) {
      const gsap = (window as any).gsap;
      const button = document.querySelector(`[data-action-id="${actionId}"]`);

      if (button) {
        gsap.to(button, {
          scale: 0.95,
          duration: 0.1,
          yoyo: true,
          repeat: 1,
          ease: 'power2.inOut',
        });
      }
    }
  }

  getActionClass(color: string): string {
    return `quick-action-btn ${color}`;
  }

  trackByActionId(index: number, action: QuickAction): string {
    return action.id;
  }
}
