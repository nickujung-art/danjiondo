/**
 * 클라이언트에서 이미지를 정사각형 크롭 + JPEG 압축
 * 프로필 사진용: 200×200px, quality 0.75 → ~10–20KB
 */
export async function compressProfileImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)

  const size = Math.min(bitmap.width, bitmap.height, 200)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')!
  const sx = (bitmap.width - size) / 2
  const sy = (bitmap.height - size) / 2
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, size, size)
  bitmap.close()

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('canvas.toBlob failed'))),
      'image/jpeg',
      0.75,
    )
  })
}
