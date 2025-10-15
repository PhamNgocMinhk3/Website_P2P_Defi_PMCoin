import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

export interface BackgroundOption {
  id: string;
  name: string;
  url: string;
  thumbnail: string;
}

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private activeColorSubject = new BehaviorSubject<string>('#7b42f6'); // Màu tím mặc định
  public activeColor$ = this.activeColorSubject.asObservable();

  private activeBackgroundSubject = new BehaviorSubject<BackgroundOption>({
    id: 'default',
    name: 'Default',
    url: '',
    thumbnail: '',
  });
  public activeBackground$ = this.activeBackgroundSubject.asObservable();

  public backgroundOptions: BackgroundOption[] = [
    { id: 'default', name: 'Mặc định', url: '', thumbnail: 'https://i.pinimg.com/736x/71/e6/95/71e69508df7c4e886a79731f3e4a84a5.jpg' },
    { id: 'sunset', name: 'Hoàng hôn', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2070&auto=format&fit=crop', thumbnail: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=200&auto=format&fit=crop' },
    { id: 'mountains', name: 'Núi non', url: 'https://images.pexels.com/photos/4761283/pexels-photo-4761283.jpeg', thumbnail: 'https://images.pexels.com/photos/4761283/pexels-photo-4761283.jpeg' },
    { id: 'forest', name: 'Rừng cây', url: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?q=80&w=2070&auto=format&fit=crop', thumbnail: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?q=80&w=200&auto=format&fit=crop' },
    { id: 'Sky', name: 'Bầu Trời', url: 'https://www.dichvuinnhanh.com/wp-content/uploads/2025/04/Anh-Dep-Hinh-Nen-Dep-Innhanh.pro_.vn-7.webp', thumbnail: 'https://www.dichvuinnhanh.com/wp-content/uploads/2025/04/Anh-Dep-Hinh-Nen-Dep-Innhanh.pro_.vn-7.webp' },
    { id: 'Sea', name: 'Biển', url: 'https://cdn2.fptshop.com.vn/unsafe/Uploads/images/tin-tuc/168009/Originals/hinh-nen-bien-4.png', thumbnail: 'https://cdn2.fptshop.com.vn/unsafe/Uploads/images/tin-tuc/168009/Originals/hinh-nen-bien-4.png' },
    { id: 'Earth', name: 'Trái Đất', url: 'https://cdn.mobilecity.vn/mobilecity-vn/images/2024/04/hinh-nen-trai-dat-cho-dien-thoai-1.jpg.webp', thumbnail: 'https://cdn.mobilecity.vn/mobilecity-vn/images/2024/04/hinh-nen-trai-dat-cho-dien-thoai-1.jpg.webp' },
    { id: 'Black-hole', name: 'Hố đen vũ trụ', url: 'https://c4.wallpaperflare.com/wallpaper/681/554/339/abstract-planet-space-purple-wallpaper-preview.jpg', thumbnail: 'https://c4.wallpaperflare.com/wallpaper/681/554/339/abstract-planet-space-purple-wallpaper-preview.jpg' },
    { id: 'Ninja', name: 'Ninja', url: 'https://c4.wallpaperflare.com/wallpaper/365/244/884/uchiha-itachi-naruto-shippuuden-anbu-silhouette-wallpaper-preview.jpg', thumbnail: 'https://c4.wallpaperflare.com/wallpaper/365/244/884/uchiha-itachi-naruto-shippuuden-anbu-silhouette-wallpaper-preview.jpg' },
    { id: 'Kimetsunodaiba', name: 'demon-slayer', url: 'https://c4.wallpaperflare.com/wallpaper/708/846/337/anime-demon-slayer-kimetsu-no-yaiba-tanjirou-kamado-hd-wallpaper-preview.jpg', thumbnail: 'https://c4.wallpaperflare.com/wallpaper/708/846/337/anime-demon-slayer-kimetsu-no-yaiba-tanjirou-kamado-hd-wallpaper-preview.jpg' },
  ];

  private isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  setActiveColor(color: string) {
    this.activeColorSubject.next(color);
    if (this.isBrowser) {
      // Chỉ truy cập localStorage khi chạy trên trình duyệt
      localStorage.setItem('chatThemeColor', color);
    }
  }

  setActiveBackground(background: BackgroundOption) {
    this.activeBackgroundSubject.next(background);
    if (this.isBrowser) {
      localStorage.setItem('chatBackground', JSON.stringify(background));
    }
  }

  loadTheme() {
    if (this.isBrowser) {
      // Chỉ truy cập localStorage khi chạy trên trình duyệt
      const savedColor = localStorage.getItem('chatThemeColor');
      if (savedColor) {
        this.activeColorSubject.next(savedColor);
      }

      const savedBackground = localStorage.getItem('chatBackground');
      if (savedBackground) {
        try {
          const background = JSON.parse(savedBackground);
          this.activeBackgroundSubject.next(background);
        } catch (e) {
          // Failed to parse saved background
        }
      }
    }
  }
}
