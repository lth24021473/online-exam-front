import { useProfileImage } from './useProfileImage'

export function useProfileAvatar(userId: string) {
  const { image, saving, error, notice, updateImage, removeImage } = useProfileImage(userId, 'avatar')
  return { avatar: image, saving, error, notice, updateAvatar: updateImage, removeAvatar: removeImage }
}
