import cloudinary from '../config/cloudinary.js';
import { Readable } from 'stream';

const transformationByKind = {
    avatar: [
        { width: 500, height: 500, crop: 'fill', gravity: 'face' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
    ],
    banner: [
        { width: 1500, height: 500, crop: 'fill', gravity: 'auto' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
    ],
    default: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
    ]
};

export const uploadToCloudinary = (buffer, options = {}) => {
    const isLegacyFolderArg = typeof options === 'string';
    const folder = isLegacyFolderArg ? options : options.folder || 'social-pulse/misc';
    const kind = isLegacyFolderArg ? 'default' : options.kind || 'default';

    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: 'image',
                transformation: transformationByKind[kind] || transformationByKind.default
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );

        // Convert buffer to stream and pipe to Cloudinary
        const readableStream = Readable.from(buffer);
        readableStream.pipe(uploadStream);
    });
};

export const deleteFromCloudinary = async (publicId) => {
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        return result;
    } catch (error) {
        console.error('Cloudinary deletion error:', error);
        throw error;
    }
};