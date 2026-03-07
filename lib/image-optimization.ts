/**
 * Optimizes an image file by resizing and converting it to WebP format.
 * This happens on the client side to reduce bandwidth and storage usage.
 */
export async function optimizeImage(
    file: File,
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.8
): Promise<File> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Calculate new dimensions while maintaining aspect ratio
                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    resolve(file);
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                // Convert to WebP
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            // Replace extension with .webp
                            const originalName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                            const optimizedFile = new File([blob], `${originalName}.webp`, {
                                type: 'image/webp',
                                lastModified: Date.now(),
                            });
                            resolve(optimizedFile);
                        } else {
                            resolve(file);
                        }
                    },
                    'image/webp',
                    quality
                );
            };
            img.onerror = () => resolve(file);
        };
        reader.onerror = () => resolve(file);
    });
}
