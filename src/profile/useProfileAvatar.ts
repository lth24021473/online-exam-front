import { useProfileImage } from './useProfileImage'

export function useProfileAvatar(userId: string, initialUrl?: string | null) {
  const { image, saving, error, notice, updateImage, removeImage } = useProfileImage(userId, 'avatar', initialUrl)
  return { avatar: image, saving, error, notice, updateAvatar: updateImage, removeAvatar: removeImage }
}
