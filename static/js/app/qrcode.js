// // QR Code generation utility for YouTube links
// // Uses Google Charts API for QR code generation (free, no API key needed)

// async function generateQRCodeUrl(url, size = 150) {
//   // Encode the URL for QR code
//   const encodedUrl = encodeURIComponent(url);
//   // Use Google Charts QR API (free, no key required)
//   return `https://chart.googleapis.com/chart?cht=qr&chl=${encodedUrl}&chs=${size}x${size}&choe=UTF-8`;
// }

// // Generate QR code as data URL (for embedding in print)
// // Returns a Promise that resolves to the data URL
// async function generateQRCodeDataURL(url, size = 150) {
//   const qrUrl = await generateQRCodeUrl(url, size);
  
//   // Fetch the image and convert to data URL
//   try {
//     const response = await fetch(qrUrl);
//     const blob = await response.blob();
//     return new Promise((resolve) => {
//       const reader = new FileReader();
//       reader.onloadend = () => resolve(reader.result);
//       reader.readAsDataURL(blob);
//     });
//   } catch (error) {
//     console.error('Error generating QR code:', error);
//     // Return a fallback placeholder
//     return null;
//   }
// }

// // Convert YouTube URL to embed URL for QR code
// function convertYoutubeToEmbed(url) {
//   if (!url) return null;
  
//   // Handle various YouTube URL formats
//   let videoId = null;
  
//   // youtube.com/watch?v=VIDEO_ID
//   const watchMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
//   if (watchMatch) {
//     videoId = watchMatch[1];
//   }
  
//   // youtu.be/VIDEO_ID
//   const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
//   if (shortMatch) {
//     videoId = shortMatch[1];
//   }
  
//   // youtube.com/embed/VIDEO_ID
//   const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
//   if (embedMatch) {
//     videoId = embedMatch[1];
//   }
  
//   if (videoId) {
//     return `https://www.youtube.com/embed/${videoId}`;
//   }
  
//   return url; // Return original if not a YouTube URL
// }

// // Generate QR code for YouTube video
// async function generateYoutubeQRCode(youtubeUrl, size = 150) {
//   const embedUrl = convertYoutubeToEmbed(youtubeUrl);
//   if (embedUrl) {
//     return await generateQRCodeDataURL(embedUrl, size);
//   }
//   return null;
// }

// // HTML template for QR code image
// function getQRCodeHTML(qrDataUrl, altText = "Scan to watch video") {
//   if (!qrDataUrl) {
//     return '';
//   }
//   return `<img src="${qrDataUrl}" alt="${altText}" style="width: 100px; height: 100px; margin-top: 10px;" />`;
// }


// QR Code generation utility (professional version)
// Generates QR codes locally using QRCode library

// Convert YouTube URL to embed URL
function convertYoutubeToEmbed(url) {
  if (!url) return null;

  let videoId = null;

  const watchMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
  if (watchMatch) videoId = watchMatch[1];

  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (shortMatch) videoId = shortMatch[1];

  const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
  if (embedMatch) videoId = embedMatch[1];

  if (videoId) {
    return `https://www.youtube.com/embed/${videoId}`;
  }

  return url;
}

// Generate QR code as DataURL
async function generateQRCodeDataURL(url, size = 150) {
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "H"
    });

    return dataUrl;

  } catch (error) {
    console.error("QR generation failed:", error);
    return null;
  }
}

// Generate YouTube QR Code
async function generateYoutubeQRCode(youtubeUrl, size = 150) {

  const embedUrl = convertYoutubeToEmbed(youtubeUrl);

  if (!embedUrl) return null;

  return await generateQRCodeDataURL(embedUrl, size);
}

// Generate HTML for printing
function getQRCodeHTML(qrDataUrl, altText = "Scan to watch video") {

  if (!qrDataUrl) return "";

  return `
    <img 
      src="${qrDataUrl}" 
      alt="${altText}" 
      style="
        width:100px;
        height:100px;
        margin-top:10px;
      "
    />
  `;
}