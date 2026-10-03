import QRCode from 'qrcode';

export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 400,
    color: {
      dark: '#1c1917',
      light: '#ffffff',
    },
  });
}

export async function generateQrBuffer(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 400,
    color: {
      dark: '#1c1917',
      light: '#ffffff',
    },
  });
}
