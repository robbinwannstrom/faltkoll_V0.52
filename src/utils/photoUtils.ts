import { Project, MomentPhoto, MomentRecord } from '../types';

/**
 * Universal safe photo URL generator and normalizer.
 * Fixes:
 * 1. Invalid `data:image/svg+xml;utf8,...` MIME format which breaks in browsers
 * 2. Truncated `...[CLOUDSYNC_PHOTO_REF]` references from previous sync
 * 3. Local cache placeholders `[BILD_SPARAD]`
 * 4. Ensures 100% valid base64 image data URLs for any <img> tag
 */

export function createPhotoPlaceholderSvg(
  title: string = 'Fältdokumentation',
  subtitle: string = 'Fotobevis registrerat',
  timestamp: string = '',
  category: string = 'Kontroll'
): string {
  const timeStr = timestamp || new Date().toISOString().substring(0, 16).replace('T', ' ');
  const cleanTitle = title.replace(/[<>&"']/g, '');
  const cleanSub = subtitle.replace(/[<>&"']/g, '');
  const cleanCat = category.replace(/[<>&"']/g, '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
    <defs>
      <linearGradient id="g_f97316" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1c1917"/>
        <stop offset="100%" stop-color="#0c0a09"/>
      </linearGradient>
    </defs>
    <rect width="640" height="480" fill="url(#g_f97316)"/>
    <rect x="24" y="24" width="592" height="432" rx="14" fill="none" stroke="#f97316" stroke-width="2.5" stroke-dasharray="6 4" opacity="0.8"/>
    <circle cx="320" cy="180" r="54" fill="#f97316" opacity="0.12"/>
    <text x="320" y="172" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="900" fill="#f97316" text-anchor="middle">📷 FÄLTDOKUMENTATION</text>
    <text x="320" y="210" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle">${cleanTitle}</text>
    <text x="320" y="245" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="500" fill="#94a3b8" text-anchor="middle">${cleanSub}</text>
    <rect x="35" y="395" width="570" height="50" rx="10" fill="#000000" opacity="0.85"/>
    <text x="55" y="426" font-family="ui-monospace, monospace" font-size="13" font-weight="900" fill="#f97316">FÄLTKOLL • ${cleanCat.toUpperCase()}</text>
    <text x="585" y="426" font-family="ui-monospace, monospace" font-size="12" fill="#ffffff" text-anchor="end">${timeStr}</text>
  </svg>`;

  try {
    if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
      return 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(svg)));
    }
  } catch {}
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function isTruncatedPhoto(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  return (
    url.includes('[CLOUDSYNC_PHOTO_REF]') ||
    url.includes('[BILD_SPARAD]') ||
    url.includes('[BILD_SPARAD_I_INDEXEDDB]')
  );
}

export function normalizePhotoUrl(dataUrl?: string | null, fallbackTitle?: string): string {
  if (!dataUrl || typeof dataUrl !== 'string' || dataUrl.trim() === '') {
    return createPhotoPlaceholderSvg(fallbackTitle || 'Kontrollfoto');
  }

  const trimmed = dataUrl.trim();

  // 1. Truncated or placeholder references
  if (isTruncatedPhoto(trimmed)) {
    return createPhotoPlaceholderSvg(
      fallbackTitle || 'Kontrollfoto bevarat',
      'Klicka "Ersätt foto" för att uppdatera med originalbild'
    );
  }

  // 2. Fix invalid `data:image/svg+xml;utf8,...` MIME type
  if (trimmed.startsWith('data:image/svg+xml;utf8,')) {
    try {
      const rawSvg = decodeURIComponent(trimmed.substring('data:image/svg+xml;utf8,'.length));
      if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
        return 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(rawSvg)));
      }
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rawSvg);
    } catch {
      return trimmed;
    }
  }

  // 3. Fix unencoded or non-base64 svg with charset
  if (trimmed.startsWith('data:image/svg+xml;charset=utf-8,')) {
    try {
      const rawSvg = decodeURIComponent(trimmed.substring('data:image/svg+xml;charset=utf-8,'.length));
      if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
        return 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(rawSvg)));
      }
    } catch {}
    return trimmed;
  }

  // 4. Regular image dataUrl or HTTP URL
  return trimmed;
}

/**
 * Check if a photo dataUrl is high quality real photo data
 */
export function isGoodPhotoData(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.includes('[CLOUDSYNC_PHOTO_REF]')) return false;
  if (url.includes('[BILD_SPARAD]')) return false;
  if (url.includes('[BILD_SPARAD_I_INDEXEDDB]')) return false;
  // SVG placeholder is inferior to real camera base64 JPEG/PNG
  if (url.startsWith('data:image/svg+xml') && (url.includes('FÄLTDOKUMENTATION') || url.includes('Kontrollfoto bevarat'))) {
    return false;
  }
  if (url.startsWith('data:image/jpeg') && url.length < 500) return false;
  return true;
}

/**
 * Merge two photo lists preserving full-resolution photos
 */
export function mergePhotoListsSafely(
  localPhotos: MomentPhoto[] = [],
  incomingPhotos: MomentPhoto[] = []
): MomentPhoto[] {
  const map = new Map<string, MomentPhoto>();

  // Start with incoming photos
  incomingPhotos.forEach((ph) => {
    if (ph && ph.id) {
      map.set(ph.id, {
        ...ph,
        dataUrl: normalizePhotoUrl(ph.dataUrl, ph.caption),
      });
    }
  });

  // Overlay local photos, preferring whichever has non-truncated high-resolution data
  localPhotos.forEach((locPh) => {
    if (!locPh || !locPh.id) return;
    const existing = map.get(locPh.id);
    if (!existing) {
      map.set(locPh.id, {
        ...locPh,
        dataUrl: normalizePhotoUrl(locPh.dataUrl, locPh.caption),
      });
    } else {
      const locIsGood = isGoodPhotoData(locPh.dataUrl);
      const extIsGood = isGoodPhotoData(existing.dataUrl);

      if (locIsGood && !extIsGood) {
        map.set(locPh.id, {
          ...existing,
          ...locPh,
          dataUrl: locPh.dataUrl,
        });
      } else if (!locIsGood && extIsGood) {
        map.set(locPh.id, {
          ...locPh,
          ...existing,
          dataUrl: existing.dataUrl,
        });
      } else {
        // Both good or both placeholder: pick longer data or newest
        const longer = (locPh.dataUrl?.length || 0) >= (existing.dataUrl?.length || 0) ? locPh : existing;
        map.set(locPh.id, {
          ...existing,
          ...locPh,
          dataUrl: longer.dataUrl || existing.dataUrl || locPh.dataUrl,
        });
      }
    }
  });

  return Array.from(map.values());
}

/**
 * Merge an incoming project with a local project, protecting photos and sync settings against data loss
 */
export function mergeProjectSafely(
  localProj: Project | undefined,
  incomingProj: Project
): Project {
  if (!localProj) {
    // Normalize any photos in incoming project
    const normalizedMoments: Record<string, MomentRecord> = {};
    if (incomingProj.moments) {
      for (const [mId, mom] of Object.entries(incomingProj.moments)) {
        normalizedMoments[mId] = {
          ...mom,
          photoBase64: mom.photoBase64 ? normalizePhotoUrl(mom.photoBase64) : undefined,
          photos: mom.photos ? mom.photos.map((p) => ({ ...p, dataUrl: normalizePhotoUrl(p.dataUrl, p.caption) })) : [],
        };
      }
    }
    const normalizedPre = (incomingProj.preInspectionPhotos || []).map((p) => ({
      ...p,
      dataUrl: normalizePhotoUrl(p.dataUrl, p.caption),
    }));

    const enrichedIncoming = {
      ...incomingProj,
      moments: normalizedMoments,
      preInspectionPhotos: normalizedPre,
    };

    if (enrichedIncoming.groupCode?.trim()) {
      enrichedIncoming.isGroupProject = true;
      enrichedIncoming.syncEnabled = true;
    }

    return enrichedIncoming;
  }

  // Both exist: intelligently combine
  const mergedMoments: Record<string, MomentRecord> = {
    ...(localProj.moments || {}),
    ...(incomingProj.moments || {}),
  };

  // Check each moment
  const allMomentIds = new Set([
    ...Object.keys(localProj.moments || {}),
    ...Object.keys(incomingProj.moments || {}),
  ]);

  allMomentIds.forEach((mId) => {
    const locMom = localProj.moments?.[mId];
    const incMom = incomingProj.moments?.[mId];

    if (locMom && !incMom) {
      mergedMoments[mId] = {
        ...locMom,
        photoBase64: locMom.photoBase64 ? normalizePhotoUrl(locMom.photoBase64) : undefined,
        photos: (locMom.photos || []).map((p) => ({ ...p, dataUrl: normalizePhotoUrl(p.dataUrl, p.caption) })),
      };
    } else if (!locMom && incMom) {
      mergedMoments[mId] = {
        ...incMom,
        photoBase64: incMom.photoBase64 ? normalizePhotoUrl(incMom.photoBase64) : undefined,
        photos: (incMom.photos || []).map((p) => ({ ...p, dataUrl: normalizePhotoUrl(p.dataUrl, p.caption) })),
      };
    } else if (locMom && incMom) {
      // Merge photos safely: if incoming photos is empty or missing, keep local photos!
      const mergedPhotos = mergePhotoListsSafely(locMom.photos || [], incMom.photos || []);
      let bestBase64 = incMom.photoBase64 || locMom.photoBase64;
      if (locMom.photoBase64 && isGoodPhotoData(locMom.photoBase64) && !isGoodPhotoData(incMom.photoBase64)) {
        bestBase64 = locMom.photoBase64;
      }
      bestBase64 = bestBase64 ? normalizePhotoUrl(bestBase64) : undefined;

      mergedMoments[mId] = {
        ...locMom,
        ...incMom,
        // Status: preserve GREEN if either is GREEN
        status: incMom.status === 'GREEN' || locMom.status === 'GREEN' ? 'GREEN' : incMom.status || locMom.status,
        signature: incMom.signature || locMom.signature,
        signatureImage: incMom.signatureImage || locMom.signatureImage,
        comment: incMom.comment || locMom.comment,
        completedAt: incMom.completedAt || locMom.completedAt,
        photos: mergedPhotos,
        photoBase64: bestBase64,
      };
    }
  });

  const mergedPrePhotos = mergePhotoListsSafely(
    localProj.preInspectionPhotos || [],
    incomingProj.preInspectionPhotos || []
  );

  // CRITICAL: Preserve groupCode and sync flags so sync connection NEVER gets removed or disconnected!
  const finalGroupCode = (incomingProj.groupCode?.trim() || localProj.groupCode?.trim() || '').toUpperCase();
  const finalIsGroup = Boolean(
    incomingProj.isGroupProject ||
    localProj.isGroupProject ||
    finalGroupCode.length > 0
  );
  const finalSyncEnabled = incomingProj.syncEnabled !== undefined
    ? incomingProj.syncEnabled
    : (localProj.syncEnabled !== undefined ? localProj.syncEnabled : true);

  return {
    ...localProj,
    ...incomingProj,
    groupCode: finalGroupCode || undefined,
    isGroupProject: finalIsGroup,
    syncEnabled: finalSyncEnabled,
    lastSyncedAt: incomingProj.lastSyncedAt || localProj.lastSyncedAt || new Date().toISOString().replace('T', ' ').substring(0, 16),
    moments: mergedMoments,
    preInspectionPhotos: mergedPrePhotos,
    studentId: incomingProj.studentId || localProj.studentId,
    studentName: incomingProj.studentName || localProj.studentName,
    studentEmail: incomingProj.studentEmail || localProj.studentEmail,
    schoolClass: incomingProj.schoolClass || localProj.schoolClass,
    studentGroup: incomingProj.studentGroup || localProj.studentGroup,
    teacherId: incomingProj.teacherId || localProj.teacherId,
    teacherName: incomingProj.teacherName || localProj.teacherName,
    creatorId: incomingProj.creatorId || localProj.creatorId,
  };
}
