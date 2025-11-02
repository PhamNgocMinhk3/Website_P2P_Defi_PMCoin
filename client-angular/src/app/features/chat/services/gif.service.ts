import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface GifResult {
  id: string;
  url: string;
  preview_url: string;
  title: string;
  width: number;
  height: number;
}

@Injectable({
  providedIn: 'root',
})
export class GifService {
  // Sử dụng public API key của Giphy (có rate limit nhưng đủ để demo)
  private readonly GIPHY_API_KEY = 'GlVGYHkr3WSBnllca54iNt0yFbjz7L65';
  private readonly GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';

  // Fallback GIFs khi không có kết nối hoặc API lỗi
  private readonly FALLBACK_GIFS: GifResult[] = [
    {
      id: 'fallback-1',
      url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif',
      preview_url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/200w.gif',
      title: 'Happy',
      width: 480,
      height: 270,
    },
    {
      id: 'fallback-2',
      url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
      preview_url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200w.gif',
      title: 'Thumbs Up',
      width: 480,
      height: 270,
    },
    {
      id: 'fallback-3',
      url: 'https://media.giphy.com/media/3o6Zt4HU9uwXmXSAuI/giphy.gif',
      preview_url: 'https://media.giphy.com/media/3o6Zt4HU9uwXmXSAuI/200w.gif',
      title: 'Clapping',
      width: 480,
      height: 270,
    },
    {
      id: 'fallback-4',
      url: 'https://media.giphy.com/media/l0HlvtIPzPdt2usKs/giphy.gif',
      preview_url: 'https://media.giphy.com/media/l0HlvtIPzPdt2usKs/200w.gif',
      title: 'Heart',
      width: 480,
      height: 270,
    },
    {
      id: 'fallback-5',
      url: 'https://media.giphy.com/media/3o7abAHdYvZdBNnGZq/giphy.gif',
      preview_url: 'https://media.giphy.com/media/3o7abAHdYvZdBNnGZq/200w.gif',
      title: 'Laughing',
      width: 480,
      height: 270,
    },
    {
      id: 'fallback-6',
      url: 'https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif',
      preview_url: 'https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/200w.gif',
      title: 'Dancing',
      width: 480,
      height: 270,
    },
  ];

  constructor(private http: HttpClient) {}

  searchGifs(query: string, limit: number = 20): Observable<GifResult[]> {
    if (!query.trim()) {
      return this.getTrendingGifs(limit);
    }

    const url = `${this.GIPHY_BASE_URL}/search`;
    const params = {
      api_key: this.GIPHY_API_KEY,
      q: query,
      limit: limit.toString(),
      rating: 'g', // Safe content only
      lang: 'en',
    };

    return this.http.get<any>(url, { params }).pipe(
      map((response) => this.mapGiphyResponse(response)),
      catchError(() => {
        // Giphy API failed, using fallback GIFs
        return of(this.getFallbackGifs(query));
      })
    );
  }

  getTrendingGifs(limit: number = 20): Observable<GifResult[]> {
    const url = `${this.GIPHY_BASE_URL}/trending`;
    const params = {
      api_key: this.GIPHY_API_KEY,
      limit: limit.toString(),
      rating: 'g',
    };

    return this.http.get<any>(url, { params }).pipe(
      map((response) => this.mapGiphyResponse(response)),
      catchError(() => {
        // Giphy API failed, using fallback GIFs
        return of(this.FALLBACK_GIFS);
      })
    );
  }

  private mapGiphyResponse(response: any): GifResult[] {
    if (!response?.data) return [];

    return response.data
      .map((gif: any) => ({
        id: gif.id,
        url: gif.images?.original?.url || gif.images?.fixed_height?.url,
        preview_url:
          gif.images?.preview_gif?.url || gif.images?.fixed_height_small?.url,
        title: gif.title || 'GIF',
        width: parseInt(gif.images?.original?.width) || 480,
        height: parseInt(gif.images?.original?.height) || 270,
      }))
      .filter((gif: GifResult) => gif.url); // Filter out any GIFs without URLs
  }

  private getFallbackGifs(query: string): GifResult[] {
    // Return all fallback GIFs for any search query
    return this.FALLBACK_GIFS;
  }
}
