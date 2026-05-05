/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOGO_DEV_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'piexifjs' {
  type IfdRecord = Record<number | string, string | number | number[]>;
  interface ExifObject {
    '0th'?: IfdRecord;
    Exif?: IfdRecord;
    GPS?: IfdRecord;
    Interop?: IfdRecord;
    '1st'?: IfdRecord;
    thumbnail?: string | null;
  }

  const piexif: {
    ImageIFD: Record<string, number>;
    ExifIFD: Record<string, number>;
    GPSIFD: Record<string, number>;
    InteropIFD: Record<string, number>;
    dump: (exifObj: ExifObject) => string;
    load: (jpegData: string) => ExifObject;
    insert: (exifBytes: string, jpegData: string) => string;
    remove: (jpegData: string) => string;
  };

  export default piexif;
}
