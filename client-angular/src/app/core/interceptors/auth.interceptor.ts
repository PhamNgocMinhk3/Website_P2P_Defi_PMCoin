import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
} from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor() {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    // Only add withCredentials for internal API requests (localhost:5000)
    // Skip external APIs like Binance to avoid CORS issues
    const isInternalAPI =
      req.url.includes('localhost:5000') || req.url.startsWith('/api');

    if (isInternalAPI) {
      const authReq = req.clone({
        withCredentials: true,
      });

      return next.handle(authReq);
    } else {
      // External API - don't modify
      return next.handle(req);
    }
  }
}
