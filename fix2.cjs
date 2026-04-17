const fs = require('fs');
let content = fs.readFileSync('src/hooks/useGooglePhotosUrl.ts', 'utf8');
content = content.replace("if (url && CloudflareR2Service.isR2Url(url)) {", "if (url && (CloudflareR2Service.isR2Url(url) || url.includes('drive.google.com'))) {");
fs.writeFileSync('src/hooks/useGooglePhotosUrl.ts', content);
