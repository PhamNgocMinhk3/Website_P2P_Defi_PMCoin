import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-call-screen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './call-screen.component.html',
  styleUrls: ['./call-screen.component.scss']
})
export class CallScreenComponent implements OnChanges {
  @Input() localStream: MediaStream | null = null;
  @Input() remoteStream: MediaStream | null = null;
  @Input() callType: 'audio' | 'video' | null = null;
  @Output() end = new EventEmitter<void>();

  @ViewChild('localVideo') localVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideo!: ElementRef<HTMLVideoElement>;

  ngOnChanges(changes: SimpleChanges): void {
    // Attach streams to video elements when they become available
    setTimeout(() => {
      try {
        if (this.localVideo && this.localStream) {
          this.localVideo.nativeElement.srcObject = this.localStream as any;
          this.localVideo.nativeElement.muted = true;
          this.localVideo.nativeElement.play().catch(() => {});
        }
        if (this.remoteVideo && this.remoteStream) {
          this.remoteVideo.nativeElement.srcObject = this.remoteStream as any;
          this.remoteVideo.nativeElement.play().catch(() => {});
        }
      } catch { /** ignore attach errors */ }
    }, 0);
  }

  onEndClick() {
    this.end.emit();
  }
}
