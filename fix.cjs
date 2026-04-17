const fs = require('fs');
let content = fs.readFileSync('src/hooks/useGooglePhotosUrl.ts', 'utf8');
content = content.replace("url.includes('photoslibrary.googleapis.com') ||", "url.includes('photoslibrary.googleapis.com')");
content = content.replace("url.includes('drive.google.com')", "");
fs.writeFileSync('src/hooks/useGooglePhotosUrl.ts', content);
