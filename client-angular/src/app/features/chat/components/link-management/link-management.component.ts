import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService, SharedLink, ChatUser } from '../../chat.service';

@Component({
  selector: 'app-link-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './link-management.component.html',
  styleUrls: ['./link-management.component.scss'],
})
export class LinkManagementComponent implements OnInit {
  sharedLinks: SharedLink[] = [];
  filteredLinks: SharedLink[] = [];
  searchTerm = '';
  selectedFilter = 'all'; // all, safe, unsafe
  showSecurityWarning = false;
  selectedLink: SharedLink | null = null;
  users: ChatUser[] = [];
  constructor(private chatService: ChatService) {}

  ngOnInit(): void {
    this.loadLinks();

    // Add some sample links for demonstration
    this.addSampleLinks();
  }

  private addSampleLinks(): void {
    const sampleLinks = [
      {
        url: 'https://github.com/angular/angular',
        title: 'Angular GitHub Repository',
        conversationId: '1',
      },
      {
        url: 'https://example.com/file.exe',
        title: 'Suspicious Download',
        conversationId: '2',
      },
      {
        url: 'https://stackoverflow.com/questions/angular',
        title: 'Angular Questions on Stack Overflow',
        conversationId: '1',
      },
    ];

    sampleLinks.forEach((link) => {
      this.chatService.addSharedLink(
        link.url,
        link.title,
        link.conversationId.toString()
      );
    });

    this.loadLinks();
  }

  private loadLinks(): void {
    this.sharedLinks = this.chatService.getSharedLinks();
    this.applyFilters();
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  private applyFilters(): void {
    let filtered = this.sharedLinks;

    // Apply search filter
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (link) =>
          (link.title || '').toLowerCase().includes(term) ||
          link.url.toLowerCase().includes(term)
      );
    }

    // Apply safety filter
    if (this.selectedFilter === 'safe') {
      filtered = filtered.filter((link) => !link.isUnsafe);
    } else if (this.selectedFilter === 'unsafe') {
      filtered = filtered.filter((link) => link.isUnsafe);
    }

    this.filteredLinks = filtered;
  }

  openLink(link: SharedLink): void {
    if (link.isUnsafe) {
      this.selectedLink = link;
      this.showSecurityWarning = true;
    } else {
      this.proceedToLink(link);
    }
  }

  proceedToLink(link: SharedLink): void {
    window.open(link.url, '_blank', 'noopener,noreferrer');
    this.closeSecurityWarning();
  }

  closeSecurityWarning(): void {
    this.showSecurityWarning = false;
    this.selectedLink = null;
  }

  getUserName(userId: string | undefined): string {
    if (userId === undefined) return 'Unknown User';
    const user = this.chatService.getUserById(userId);
    return user ? user.name : 'Unknown User';
  } 

  formatDate(date: Date): string {
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)} hours ago`;
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  }

  getLinkIcon(url: string): string {
    if (url.includes('github.com')) return '🐙';
    if (url.includes('stackoverflow.com')) return '📚';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return '📺';
    if (url.includes('twitter.com') || url.includes('x.com')) return '🐦';
    if (url.includes('linkedin.com')) return '💼';
    if (url.match(/\.(exe|zip|rar|dmg)$/i)) return '⚠️';
    return '🔗';
  }

  copyLink(link: SharedLink, event: Event): void {
    event.stopPropagation();
    navigator.clipboard.writeText(link.url).then(() => {
      // Could show a toast notification here
      // Link copied to clipboard
    });
  }

  trackByLinkId(index: number, link: SharedLink): number {
    return link.id;
  }

  getSafeLinksCount(): number {
    return this.sharedLinks.filter((l) => !l.isUnsafe).length;
  }

  getUnsafeLinksCount(): number {
    return this.sharedLinks.filter((l) => l.isUnsafe).length;
  }

  isExecutableFile(url: string): boolean {
    return !!url.match(/\.(exe|zip|rar|dmg)$/i);
  }

  isShortUrl(url: string): boolean {
    return url.includes('bit.ly') || url.includes('tinyurl');
  }
}
