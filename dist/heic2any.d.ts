import "./gifshot";
import "./libheif";
declare function heic2any({ blob, toType, quality, gifInterval, multiple, useWorker, }: {
    blob: Blob;
    multiple?: true;
    toType?: string;
    quality?: number;
    gifInterval?: number;
    useWorker?: boolean;
}): Promise<Blob | Blob[]>;
export default heic2any;
