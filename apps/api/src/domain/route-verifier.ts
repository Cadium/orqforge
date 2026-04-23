export interface RouteVerifier {
  verify(routePath: string): Promise<void>;
}

