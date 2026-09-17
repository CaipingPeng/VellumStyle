/** 只允许最后发起的请求提交结果；等待期间的编辑由调用方另行保存。 */
export function createLatestRequest() {
  let version = 0;
  return () => {
    const request = ++version;
    return () => request === version;
  };
}
