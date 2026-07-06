/** gRPC 客户端占位 — Batch 1 仅声明接口，Batch 2+ 实现真实连接 */
export interface CoreGrpcClient {
  ping(): Promise<{ message: string }>;
}

export class CoreGrpcClientStub implements CoreGrpcClient {
  constructor(private readonly addr: string) {}

  async ping(): Promise<{ message: string }> {
    return { message: `core stub at ${this.addr}` };
  }
}

export function createCoreGrpcClient(addr: string): CoreGrpcClient {
  return new CoreGrpcClientStub(addr);
}
