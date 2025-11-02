import { Injectable } from '@angular/core';
import { ChatMessage, FileMessage, ImageMessage, SharedFile, SharedImage } from '../../core/models/chat.models';

@Injectable({
  providedIn: 'root'
})
export class MediaService {

  constructor() { }

  /**
   * Trích xuất tất cả các hình ảnh từ danh sách tin nhắn.
   */
  getSharedImages(messages: ChatMessage[]): SharedImage[] {
    if (!messages || messages.length === 0) {
      return [];
    }

    const images: SharedImage[] = [];
    messages
      .filter((msg): msg is ChatMessage & { type: 'image', imageUrls: string[] } => msg.type === 'image' && !!msg.imageUrls)
      .forEach((msg) => {
        if (msg.imageUrls && Array.isArray(msg.imageUrls)) {
          msg.imageUrls.forEach((url: string, index: number) => {
            images.push({
              url: url,
              name: `Image ${msg.id}-${index + 1}`,
              messageId: msg.id,
              sender: msg.senderUsername || 'Unknown',
              date: msg.timestamp,
              type: 'image',
            });
          });
        }
      });
    return images;
  }

  /**
   * Trích xuất tất cả các file từ danh sách tin nhắn.
   */
  getSharedFiles(messages: ChatMessage[]): SharedFile[] {
    if (!messages || messages.length === 0) {
      return [];
    }

    return messages
      .filter((msg): msg is ChatMessage & { type: 'file', fileInfo: FileMessage } => msg.type === 'file' && !!msg.fileInfo)
      .map((msg) => ({
        name: msg.fileInfo.name,
        size: msg.fileInfo.size,
        type: this.getFileTypeFromName(msg.fileInfo.name),
        url: msg.fileInfo.url || '#',
        messageId: msg.id,
        date: msg.timestamp,
        sender: msg.senderUsername,
      }));
  }

  /**
   * Tải một file.
   */
  async downloadFile(file: SharedFile): Promise<void> {
    if (file && file.url && file.url !== '#') {
      try {
        // Sử dụng fetch để lấy nội dung file dưới dạng blob
        const response = await fetch(file.url);
        if (!response.ok) {
          throw new Error('Network response was not ok.');
        }
        const blob = await response.blob();

        // Tạo một URL tạm thời cho blob
        const blobUrl = window.URL.createObjectURL(blob);

        // Tạo thẻ <a> và kích hoạt download
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Dọn dẹp URL tạm thời
        window.URL.revokeObjectURL(blobUrl);
      } catch (error) {
        console.error('Download failed:', error);
        // Nếu fetch thất bại, mở link trong tab mới như một phương án dự phòng
        window.open(file.url, '_blank');
      }
    } else {
      alert('File không khả dụng để tải xuống');
    }
  }

  /**
   * Lấy class icon FontAwesome dựa trên loại file.
   */
  getFileIcon(file: SharedFile): string {
    switch (file.type) {
      case 'pdf': return 'fas fa-file-pdf';
      case 'excel': return 'fas fa-file-excel';
      case 'word': return 'fas fa-file-word';
      case 'image': return 'fas fa-file-image';
      case 'video': return 'fas fa-file-video';
      case 'audio': return 'fas fa-file-audio';
      default: return 'fas fa-file';
    }
  }

  /**
   * Lấy màu sắc dựa trên loại file.
   */
  getFileTypeColor(file: SharedFile): string {
    switch (file.type) {
      case 'pdf': return '#dc2626';
      case 'excel': return '#059669';
      case 'word': return '#2563eb';
      case 'image': return '#7c3aed';
      case 'video': return '#ea580c';
      case 'audio': return '#0891b2';
      default: return '#6b7280';
    }
  }

  /**
   * Lấy loại file từ tên file.
   */
  private getFileTypeFromName(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const types: { [key: string]: string } = {
      'pdf': 'pdf', 'xlsx': 'excel', 'xls': 'excel', 'docx': 'word', 'doc': 'word',
      'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image',
      'mp4': 'video', 'avi': 'video', 'mov': 'video', 'mp3': 'audio', 'wav': 'audio'
    };
    return types[extension || ''] || 'file';
  }
}