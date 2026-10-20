import { useProfileImage } from './useProfileImage'

export function useProfileCover(userId: string, initialUrl?: string | null) {
  const { image, saving, error, notice, updateImage, removeImage } = useProfileImage(userId, 'cover', initialUrl)
  return { cover: image, saving, error, notice, updateCover: updateImage, removeCover: removeImage }
}
