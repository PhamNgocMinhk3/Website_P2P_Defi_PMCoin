const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Phân tích bundle size của Angular app...\n');

// Kiểm tra xem có webpack-bundle-analyzer không
try {
    require.resolve('webpack-bundle-analyzer');
    console.log('✅ webpack-bundle-analyzer đã được cài đặt');
} catch (e) {
    console.log('📦 Cài đặt webpack-bundle-analyzer...');
    execSync('npm install --save-dev webpack-bundle-analyzer', { stdio: 'inherit' });
}

// Tạo script build với bundle analyzer
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Thêm script analyze vào package.json
if (!packageJson.scripts.analyze) {
    packageJson.scripts.analyze = 'ng build --stats-json && webpack-bundle-analyzer dist/client-angular/stats.json';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log('✅ Đã thêm script analyze vào package.json');
}

console.log('\n🎯 Các bước để giảm bundle size:');
console.log('1. Chạy: npm run analyze');
console.log('2. Xem bundle nào chiếm nhiều dung lượng nhất');
console.log('3. Áp dụng các kỹ thuật tối ưu sau:\n');

console.log('📋 Các kỹ thuật tối ưu bundle size:');
console.log('• Lazy loading cho các module');
console.log('• Tree shaking cho unused code');
console.log('• Code splitting cho các route');
console.log('• Sử dụng dynamic imports');
console.log('• Tối ưu third-party libraries');
console.log('• Gzip compression');
console.log('• CDN cho các thư viện lớn');

console.log('\n🚀 Để build lại và kiểm tra:');
console.log('npm run build'); 