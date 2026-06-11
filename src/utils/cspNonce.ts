export function getCodeMirrorCspNonce(root: ParentNode = document): string | undefined {
  for (const style of Array.from(root.querySelectorAll("style"))) {
    const nonce = style.nonce || style.getAttribute("nonce") || "";
    if (nonce) {
      return nonce;
    }
  }
  return undefined;
}
