import { useEffect } from "react";
import { BackgroundVideo } from "@/components/shell/BackgroundVideo";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePreferences } from "@/hooks/usePreferences";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import {
  applyBackgroundCache,
  buildBackgroundCache,
  persistBackgroundCache,
  resolveBackgroundVideo,
} from "@/utils/background";

/** 同步图片首帧缓存，并在满足回退条件时叠加当前设备的视频。 */
export function BackgroundLayer() {
  const { resolvedAppearance, farmScene } = usePreferences();
  const isMobile = useMediaQuery("(max-width: 720px)");
  const {
    enableBackgroundImage,
    backgroundImageInFarm,
    backgroundImage,
    backgroundVideo,
    backgroundImageMobile,
    backgroundVideoMobile,
    backgroundAlignment,
    surfaceOpacity,
    isReady,
  } = useThemeSettings();

  useEffect(() => {
    if (!isReady) return;
    const cache = buildBackgroundCache({
      enableBackgroundImage,
      backgroundImageInFarm,
      backgroundImage,
      backgroundImageMobile,
      backgroundAlignment,
      surfaceOpacity,
    });
    persistBackgroundCache(cache);
    applyBackgroundCache(cache, resolvedAppearance, farmScene);
  }, [
    isReady,
    enableBackgroundImage,
    backgroundImageInFarm,
    backgroundImage,
    backgroundImageMobile,
    backgroundAlignment,
    surfaceOpacity,
    resolvedAppearance,
    farmScene,
  ]);

  const videoUrl = isReady
    ? resolveBackgroundVideo(
        {
          enableBackgroundImage,
          backgroundImageInFarm,
          backgroundImage,
          backgroundVideo,
          backgroundImageMobile,
          backgroundVideoMobile,
        },
        resolvedAppearance,
        farmScene,
        isMobile,
      )
    : "";
  return videoUrl ? (
    <BackgroundVideo key={videoUrl} src={videoUrl} alignment={backgroundAlignment} />
  ) : null;
}
