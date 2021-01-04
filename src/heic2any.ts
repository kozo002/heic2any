import "./gifshot";
import "./libheif";

const supportedMIMETypes = ["image/png", "image/jpeg", "image/gif"];

type ResultType = "Blob" | "ImageData";

const utils = {
	blobToDataURL: function (blob: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			let reader = new FileReader();
			reader.onerror = function () {
				reject("ERR_DOM Error on converting blob to data URL");
			};
			reader.onload = (e) => {
				resolve((reader as any).result);
			};
			reader.readAsDataURL(blob);
		});
	},

	dataURItoBlob: function (dataURI: string): Blob | string {
		try {
			var byteString = atob(dataURI.split(",")[1]);
			var mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];
			var ab = new ArrayBuffer(byteString.length);
			var ia = new Uint8Array(ab);
			for (var i = 0; i < byteString.length; i++) {
				ia[i] = byteString.charCodeAt(i);
			}
			var blob = new Blob([ab], { type: mimeString });
			return blob;
		} catch (e) {
			return "ERR_DOM Error on converting data URI to blob " + e &&
				e.toString
				? e.toString()
				: e;
		}
	},

	imageDataToBlob: function ({
		imageData,
		toType = "image/png",
		quality = 0.92,
	}: {
		imageData: ImageData;
		toType?: string;
		quality?: number;
	}): Promise<Blob> {
		// normalize quality
		if (quality > 1 || quality < 0) {
			quality = 0.92;
		}
		// normalize MIME type
		if (supportedMIMETypes.indexOf(toType) === -1) {
			toType = "image/png";
		}
		return new Promise((resolve, reject) => {
			let canvas: HTMLCanvasElement | null = null;

			try {
				canvas = document.createElement("canvas");
			} catch (e) {}

			if (!canvas) {
				return reject(
					"ERR_CANVAS Error on converting imagedata to blob: Could not create canvas element"
				);
			}

			canvas.width = imageData.width;
			canvas.height = imageData.height;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				return reject(
					"ERR_CANVAS Error on converting imagedata to blob: Could not get canvas context"
				);
			}
			ctx.putImageData(imageData, 0, 0);
			canvas.toBlob(
				(blob) => {
					if (!blob) {
						return reject(
							"ERR_CANVAS Error on converting imagedata to blob: Could not get blob from canvas"
						);
					}
					return resolve(blob);
				},
				toType,
				quality
			);
		});
	},

	imagesToGif: function ({
		images,
		interval,
		gifHeight,
		gifWidth,
	}: {
		images: string[];
		interval: number;
		gifHeight: number;
		gifWidth: number;
	}): Promise<string> {
		return new Promise((resolve, reject) => {
			gifshot.createGIF(
				{
					images,
					interval,
					gifHeight,
					gifWidth,
				},
				(res) => {
					if (res.error) {
						reject(`ERR_GIF ${res.errorCode} ${res.errorMessage}`);
					}
					return resolve(res.image);
				}
			);
		});
	},

	otherImageType: function (buffer: ArrayBuffer) {
		/**
		 * Some confusion might arise when passing a regular image
		 * like jpeg/png/gif and getting "format is not supported"
		 * so to solve this, we should detect if the image is
		 * already browser-readable.
		 */
		const arr = new Uint8Array(buffer).subarray(0, 4);
		let header = "";
		for (let i = 0; i < arr.length; i++) {
			header = header + arr[i].toString(16);
		}
		switch (header) {
			case "89504e47":
				return "image/png";
			case "47494638":
				return "image/gif";
			case "ffd8ffe0":
			case "ffd8ffe1":
			case "ffd8ffe2":
			case "ffd8ffe3":
			case "ffd8ffe8":
				return "image/jpeg";
			default:
				return false;
		}
	},

	error: function (message: string) {
		/**
		 * Error coding system:
		 *
		 * UNKNOWN = 0
		 * USER errors = 1
		 * LIBHEIF errors = 2
		 * GIF errors = 3
		 * DOM errors = 4
		 * CANVAS errors = 5
		 *
		 */

		let code = 0;

		if (!message) {
			message = "ERR_UNKNOWN";
		} else if (typeof message !== "string") {
			if ((message as any).toString) {
				message = (message as any).toString();
			} else {
				message = JSON.stringify(message);
			}
		}

		const headers = [
			"ERR_USER",
			"ERR_LIBHEIF",
			"ERR_GIF",
			"ERR_DOM",
			"ERR_CANVAS",
		];
		for (let index = 0; index < headers.length; index++) {
			const header = headers[index];
			if (message.indexOf(header) === 0) {
				code = index + 1;
			}
		}
		return {
			code,
			message,
		};
	},
};

function processSingleImage(image: libheif.DecodeResult): Promise<ImageData> {
	return new Promise((resolve, reject) => {
		const w = image.get_width();
		const h = image.get_height();
		const whiteImage = new ImageData(w, h);
		for (let i = 0; i < w * h; i++) {
			whiteImage.data[i * 4 + 3] = 255;
		}
		image.display(whiteImage, (imageData) => {
			if (!imageData) {
				return reject(
					"ERR_LIBHEIF Error while processing single image and generating image data, could not ensure image"
				);
			}
			resolve(imageData);
		});
	});
}

function processor(id: string, buffer: ArrayBuffer): Promise<{
  id: string;
  imageDataArr: ImageData[];
  error: string;
}> {
  return new Promise((resolve, reject) => {
    try {
      const decoder = new libheif.HeifDecoder();
      let imagesArr = decoder.decode(buffer);
      if (!imagesArr || !imagesArr.length) {
        throw "ERR_LIBHEIF format not supported";
      }
      imagesArr = imagesArr.filter((x) => {
        let valid = true;
        try {
          /*
          sometimes the heic container is valid
          yet the images themselves are corrupt
          */
          x.get_height();
        } catch (e) {
          valid = false;
        }
        return valid;
      });
      if (!imagesArr.length) {
        throw "ERR_LIBHEIF Heic doesn't contain valid images";
      }

      Promise.all(imagesArr.map((image) => processSingleImage(image)))
        .then((imageDataArr) => {
          resolve({
            id,
            imageDataArr,
            error: ""
          })
        })
        .catch((e) => {
        	reject(e && e.toString ? e.toString() : e)
        });
    } catch (e) {
      reject(e && e.toString ? e.toString() : e)
    }
  });
}

function decodeBuffer(
	buffer: ArrayBuffer,
	options: { useWorker: boolean } = { useWorker: true }
): Promise<ImageData[]> {
	const id = (Math.random() * new Date().getTime()).toString();

	if (options.useWorker) {
		return new Promise((resolve, reject) => {
			const message = { id, buffer };
			((window as any).__heic2any__worker as Worker).postMessage(message);
			((window as any).__heic2any__worker as Worker).addEventListener(
				"message",
				(message) => {
					if (message.data.id === id) {
						if (message.data.error) {
							return reject(message.data.error);
						}
						return resolve(message.data.imageDataArr);
					}
				}
			);
		});
	}

	return new Promise((resolve, reject) => {
		processor(id, buffer).then((data) => {
			if (data.id === id) {
				if (data.error) {
					console.error(data.error)
					return reject(data.error);
				}
				return resolve(data.imageDataArr);
			}
			return resolve([]);
		}).catch((err) => {
			reject(err)
		});
	});
}

function heic2any({
	blob,
	toType = "image/png",
	quality = 0.92,
	gifInterval = 0.4,
	multiple = undefined,
	useWorker = true,
}: {
	blob: Blob;
	multiple?: true;
	toType?: string;
	quality?: number;
	gifInterval?: number;
	useWorker?: boolean;
}): Promise<Blob | Blob[]> {
	return new Promise(
		(
			resolve,
			reject: (reason: { code: number; message: string }) => void
		) => {
			if (!(blob instanceof Blob)) {
				utils.error(`ERR_USER library only accepts BLOBs as input`);
			}
			if (typeof multiple !== "boolean") {
				utils.error(
					`ERR_USER "multiple" parameter should be of type "boolean"`
				);
			}
			if (typeof quality !== "number") {
				utils.error(
					`ERR_USER "quality" parameter should be of type "number"`
				);
			}
			if (typeof gifInterval !== "number") {
				utils.error(
					`ERR_USER "gifInterval" parameter should be of type "number"`
				);
			}
			const reader = new FileReader();
			reader.onload = (e) => {
				let gifWidth = 0;
				let gifHeight = 0;
				const buffer = (e as any).target.result;
				const otherImageType = utils.otherImageType(buffer);
				if (otherImageType) {
					return reject(
						utils.error(
							`ERR_USER Image is already browser readable: ${otherImageType}`
						)
					);
				}
				decodeBuffer(buffer, { useWorker })
					.then((imageDataArr) => {
						gifWidth = imageDataArr[0].width;
						gifHeight = imageDataArr[0].height;
						return Promise.all(
							imageDataArr.map((imageData) =>
								utils.imageDataToBlob({
									imageData,
									toType,
									quality,
								})
							)
						);
					})
					.then((blobs) => {
						if (toType === "image/gif") {
							return Promise.all(
								blobs.map((blob) => utils.blobToDataURL(blob))
							);
						} else if (multiple) {
							resolve(blobs);
							return [""];
						} else {
							resolve(blobs[0]);
							return [""];
						}
					})
					.then((dataURIs) => {
						if (toType === "image/gif" && dataURIs) {
							return utils.imagesToGif({
								images: dataURIs,
								interval: gifInterval,
								gifWidth,
								gifHeight,
							});
						}
						return "";
					})
					.then((resultingGif) => {
						if (toType === "image/gif" && resultingGif) {
							const blob = utils.dataURItoBlob(resultingGif);
							if (typeof blob === "string") {
								reject(utils.error(blob));
							} else {
								resolve(blob);
							}
						}
					})
					.catch((e) => {
						reject(utils.error(e));
					});
			};
			reader.readAsArrayBuffer(blob);
		}
	);
}

export default heic2any;
