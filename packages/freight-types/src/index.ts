/**
 * @freight/types - Shared TypeScript types & Zod schemas for Kigali Freight
 *
 * This package is the single source of truth for all API contracts.
 * Import from here to get type-safe request/response types across all apps.
 */

// Re-export all schemas and types
export * from './schemas/index.js';

// Convenience re-exports for common usage
export type {
  // Auth
  SignupRequest,
  LoginRequest,
  RefreshRequest,
  LogoutRequest,
  TokenPair,
  AuthResponse,
  UserRole,

  // Users
  User,
  UserListResponse,
  UpdateUserRoleRequest,

  // Orders
  OrderStatus,
  CreateOrderRequest,
  Order,
  OrderListResponse,
  OrderSingleResponse,
  AssignOrdersRequest,
  AssignOrdersResponse,
  UpdateOrderStatusRequest,
  OrderStatusLog,
  OrderHistoryResponse,
  NearestDriver,
  NearestDriversResponse,
  PoolingBatch,
  PoolingResponse,

  // Fleet / Telemetry
  TelemetryIngestRequest,
  TelemetryIngestResponse,
  FleetTelemetrySheetDriver,
  FleetTelemetrySheetResponse,
  DriverBreadcrumbsResponse,
  FleetPerformanceDriver,
  FleetPerformanceResponse,

  // Geofences
  CreateGeofenceRequest,
  Geofence,
  GeofenceListResponse,
  GeofenceResponse,
  GeofenceDeleteResponse,
  ImportGeofenceRequest,

  // Routes (VRP)
  VrpStop,
  VrpVehicle,
  VrpDepot,
  VrpOptimizeRequest,
  VrpRoute,
  VrpOptimizeResponse,
  SaveRouteRequest,
  CommitRouteRequest,
  Route,
  RouteListResponse,
  RouteResponse,

  // Dispatch
  DispatchMatrixRequest,
  DispatchMatrixDriver,
  DispatchMatrixResponse,

  // Incidents
  CreateIncidentRequest,
  Incident,
  IncidentListResponse,
  AcknowledgeIncidentRequest,

  // Delivery Stops
  CreateStopRequest,
  Stop,
  StopListResponse,
  StopResponse,
  StopDeleteResponse,

  // Notifications
  RegisterPushTokenRequest,
  RegisterPushTokenResponse,

  // Vehicles
  CreateVehicleRequest,
  Vehicle,
  VehicleListResponse,
  VehicleResponse,
  AssignVehicleRequest,

  // Audit Logs
  AuditLog,
  AuditLogListResponse,

  // System
  HealthResponse,
  ReadyResponse,

  // Common
  ApiResponse,
  PaginationQuery,
  Coordinates,
} from './schemas/index.js';

// Re-export schemas for validation
export {
  // Auth
  SignupRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
  LogoutRequestSchema,
  TokenPairSchema,
  AuthResponseSchema,
  UserRoleEnum,

  // Users
  UserSchema,
  UserListResponseSchema,
  UpdateUserRoleRequestSchema,

  // Orders
  OrderStatusEnum,
  CreateOrderRequestSchema,
  OrderSchema,
  OrderListResponseSchema,
  OrderSingleResponseSchema,
  AssignOrdersRequestSchema,
  AssignOrdersResponseSchema,
  UpdateOrderStatusRequestSchema,
  OrderStatusLogSchema,
  OrderHistoryResponseSchema,
  NearestDriverSchema,
  NearestDriversResponseSchema,
  PoolingBatchSchema,
  PoolingResponseSchema,

  // Fleet / Telemetry
  TelemetryIngestRequestSchema,
  TelemetryIngestResponseSchema,
  FleetTelemetrySheetDriverSchema,
  FleetTelemetrySheetResponseSchema,
  DriverBreadcrumbsResponseSchema,
  FleetPerformanceDriverSchema,
  FleetPerformanceResponseSchema,

  // Geofences
  CreateGeofenceRequestSchema,
  GeofenceSchema,
  GeofenceListResponseSchema,
  GeofenceResponseSchema,
  GeofenceDeleteResponseSchema,
  ImportGeofenceRequestSchema,

  // Routes (VRP)
  VrpStopSchema,
  VrpVehicleSchema,
  VrpDepotSchema,
  VrpOptimizeRequestSchema,
  VrpRouteSchema,
  VrpOptimizeResponseSchema,
  SaveRouteRequestSchema,
  CommitRouteRequestSchema,
  RouteSchema,
  RouteListResponseSchema,
  RouteResponseSchema,

  // Dispatch
  DispatchMatrixRequestSchema,
  DispatchMatrixDriverSchema,
  DispatchMatrixResponseSchema,

  // Incidents
  CreateIncidentRequestSchema,
  IncidentSchema,
  IncidentListResponseSchema,
  AcknowledgeIncidentRequestSchema,

  // Delivery Stops
  CreateStopRequestSchema,
  StopSchema,
  StopListResponseSchema,
  StopResponseSchema,
  StopDeleteResponseSchema,

  // Notifications
  RegisterPushTokenRequestSchema,
  RegisterPushTokenResponseSchema,

  // Vehicles
  CreateVehicleRequestSchema,
  VehicleSchema,
  VehicleListResponseSchema,
  VehicleResponseSchema,
  AssignVehicleRequestSchema,

  // Audit Logs
  AuditLogSchema,
  AuditLogListResponseSchema,

  // System
  HealthResponseSchema,
  ReadyResponseSchema,

  // Common
  SuccessResponseSchema,
  ErrorResponseSchema,
  ApiResponseSchema,
  PaginationQuerySchema,
  CoordinatesSchema,
} from './schemas/index.js';