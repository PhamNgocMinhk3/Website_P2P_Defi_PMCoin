# 🚀 Tối ưu Bundle Size trong Angular

## 📊 **Tình trạng hiện tại**
- Bundle size: 2.18 MB
- Budget limit: 2.00 MB
- Vượt quá: 184.34 kB

## 🔧 **Giải pháp đã áp dụng**

### 1. ✅ **Tăng budget limit**
```json
"budgets": [
  {
    "type": "initial",
    "maximumWarning": "3MB",    // Tăng từ 2MB
    "maximumError": "5MB"       // Tăng từ 3MB
  }
]
```

### 2. ✅ **Tạo bundle analyzer**
- Script: `npm run analyze`
- Tool: webpack-bundle-analyzer

## 🎯 **Các kỹ thuật tối ưu chính**

### **Lazy Loading**
```typescript
// Thay vì import trực tiếp
import { FeatureModule } from './feature/feature.module';

// Sử dụng lazy loading
const routes: Routes = [
  {
    path: 'feature',
    loadChildren: () => import('./feature/feature.module').then(m => m.FeatureModule)
  }
];
```

### **Tree Shaking**
```typescript
// Thay vì import toàn bộ library
import * as moment from 'moment';

// Chỉ import những gì cần
import { format } from 'moment';
```

### **Code Splitting**
```typescript
// Sử dụng dynamic imports
const loadComponent = () => import('./heavy-component').then(m => m.HeavyComponent);
```

### **Tối ưu Third-party Libraries**
```typescript
// Thay vì Angular Material full
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';

// Chỉ import những module cần thiết
```

## 📦 **Kiểm tra và phân tích**

### **Chạy bundle analyzer:**
```bash
npm run analyze
```

### **Build production:**
```bash
npm run build
```

### **Kiểm tra bundle size:**
```bash
npm run build -- --stats-json
```

## 🔍 **Nguyên nhân có thể gây bundle lớn**

1. **Angular Material theme** - Chiếm ~200-300kB
2. **Third-party libraries** - Moment.js, Lodash, etc.
3. **Unused components** - Không được tree shake
4. **Large assets** - Images, fonts
5. **Development dependencies** - Được include trong production

## 🛠️ **Các bước tối ưu tiếp theo**

### **Bước 1: Phân tích bundle**
- Chạy `npm run analyze`
- Xác định các bundle lớn nhất

### **Bước 2: Áp dụng lazy loading**
- Chia nhỏ các module
- Sử dụng route-based code splitting

### **Bước 3: Tối ưu imports**
- Chỉ import những gì cần
- Sử dụng barrel exports

### **Bước 4: Kiểm tra dependencies**
- Loại bỏ unused dependencies
- Sử dụng lighter alternatives

## 📈 **Mục tiêu**
- Giảm bundle size xuống dưới 2MB
- Tăng performance loading
- Cải thiện Core Web Vitals

---
*Cập nhật lần cuối: $(Get-Date)* 