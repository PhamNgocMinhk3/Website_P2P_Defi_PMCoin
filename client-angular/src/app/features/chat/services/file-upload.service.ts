import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface UploadedFile {
  url: string;
  fileName: string;
  fileSize: string;
  mimeType: string;
}

@Injectable({
  providedIn: 'root'
})
export class FileUploadService {
  private apiUrl = `${environment.apiUrl}/api/files`;

  constructor(private http: HttpClient) { }

  uploadFile(file: File): Observable<UploadedFile> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    // The browser will automatically set the 'Content-Type' header for FormData.
    return this.http.post<UploadedFile>(`${this.apiUrl}/upload`, formData);
  }
}
