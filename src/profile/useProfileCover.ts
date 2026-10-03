import { useProfileImage } from './useProfileImage'

export function useProfileCover(userId: string) {
  const { image, saving, error, notice, updateImage, removeImage } = useProfileImage(userId, 'cover')
  return { cover: image, saving, error, notice, updateCover: updateImage, removeCover: removeImage }
}
