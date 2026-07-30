/**
 * Shared Zod schemas for all API contracts
 * This is the SINGLE SOURCE OF TRUTH for request/response types
 *
 * Used by:
 * - Router (Fastify/Express) for validation
 * - UI (TanStack Query) for type-safe API calls
 * - Driver (React Native) for type-safe API calls
 * - OpenAPI generation
 */

import { z } from 'zod';

// ============================================
// Primitives & Common
// ============================================

export const SuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
});

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const ApiResponseSchema = z.union([SuccessResponseSchema, ErrorResponseSchema]);

export type ApiResponse<T = unknown> = z.infer<typeof ApiResponseSchema> & { data?: T };

// Pagination
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

// Coordinates
export const CoordinatesSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
});

export type Coordinates = z.infer<typeof CoordinatesSchema>;

// ============================================
// Auth
// ============================================

export const UserRoleEnum = z.enum(['admin', 'dispatcher', 'driver', 'merchant']);
export type UserRole = z.infer<typeof UserRoleEnum>;

export const SignupRequestSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(128),
  role: UserRoleEnum.optional(), // Ignored for public signup, forced to 'driver'
});

export const LoginRequestSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const RefreshRequestSchema = z.object({
  refreshToken: z.string(),
});

export const LogoutRequestSchema = z.object({
  refreshToken: z.string(),
});

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  role: UserRoleEnum,
});

export const AuthResponseSchema = SuccessResponseSchema.extend({
  data: TokenPairSchema,
});

export type SignupRequest = z.infer<typeof SignupRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;
export type TokenPair = z.infer<typeof TokenPairSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

// ============================================
// Users
// ============================================

export const UserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string(),
  email: z.string().email().nullable(),
  role: UserRoleEnum,
  createdAt: z.string().datetime(),
});

export const UserListResponseSchema = SuccessResponseSchema.extend({
  data: z.array(UserSchema),
});

export const UpdateUserRoleRequestSchema = z.object({
  role: UserRoleEnum,
});

export type User = z.infer<typeof UserSchema>;
export type UserListResponse = z.infer<typeof UserListResponseSchema>;
export type UpdateUserRoleRequest = z.infer<typeof UpdateUserRoleRequestSchema>;

// ============================================
// Orders
// ============================================

export const OrderStatusEnum = z.enum([
  'PENDING',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'ARRIVED',
  'DELIVERED',
  'CANCELLED',
]);

export type OrderStatus = z.infer<typeof OrderStatusEnum>;

export const CreateOrderRequestSchema = z.object({
  cargoDescription: z.string().min(1).max(500),
  weightKg: z.number().positive(),
  originHubName: z.string().min(1).max(100),
  pickupLng: z.number().finite(),
  pickupLat: z.number().finite(),
  deliveryLng: z.number().finite(),
  deliveryLat: z.number().finite(),
});

export const OrderSchema = z.object({
  id: z.number().int().positive(),
  cargoDescription: z.string(),
  status: OrderStatusEnum,
  weightKg: z.number(),
  originHubName: z.string(),
  pickupLng: z.number(),
  pickupLat: z.number(),
  deliveryLng: z.number(),
  deliveryLat: z.number(),
  driverId: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const OrderListResponseSchema = SuccessResponseSchema.extend({
  data: z.array(OrderSchema),
});

export const OrderSingleResponseSchema = SuccessResponseSchema.extend({
  data: OrderSchema,
});

export const AssignOrdersRequestSchema = z.object({
  orderIds: z.array(z.number().int().positive()).min(1),
  driverName: z.string().min(1),
});

export const AssignOrdersResponseSchema = SuccessResponseSchema.extend({
  data: z.object({
    message: z.string(),
    dispatchedCount: z.number().int().nonnegative(),
  }),
});

export const UpdateOrderStatusRequestSchema = z.object({
  status: OrderStatusEnum,
});

export const OrderStatusLogSchema = z.object({
  previousStatus: OrderStatusEnum,
  newStatus: OrderStatusEnum,
  changedBy: z.string(),
  changedAt: z.string().datetime(),
});

export const OrderHistoryResponseSchema = SuccessResponseSchema.extend({
  data: z.array(OrderStatusLogSchema),
});

export const NearestDriverSchema = z.object({
  driverName: z.string(),
  distanceFromPickupKm: z.number(),
  telemetryAgeSeconds: z.number().int().nonnegative(),
  coordinates: CoordinatesSchema,
});

export const NearestDriversResponseSchema = SuccessResponseSchema.extend({
  data: z.object({
    orderId: z.number().int().positive(),
    cargo: z.string(),
    status: OrderStatusEnum,
    recommendedDrivers: z.array(NearestDriverSchema),
  }),
});

export const PoolingBatchSchema = z.object({
  batchId: z.string(),
  originCluster: z.string(),
  totalWeightKg: z.string(),
  shipments: z.array(OrderSchema),
});

export const PoolingResponseSchema = SuccessResponseSchema.extend({
  data: z.array(PoolingBatchSchema),
});

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type OrderListResponse = z.infer<typeof OrderListResponseSchema>;
export type OrderSingleResponse = z.infer<typeof OrderSingleResponseSchema>;
export type AssignOrdersRequest = z.infer<typeof AssignOrdersRequestSchema>;
export type AssignOrdersResponse = z.infer<typeof AssignOrdersResponseSchema>;
export type UpdateOrderStatusRequest = z.infer<typeof UpdateOrderStatusRequestSchema>;
export type OrderStatusLog = z.infer<typeof OrderStatusLogSchema>;
export type OrderHistoryResponse = z.infer<typeof OrderHistoryResponseSchema>;
export type NearestDriver = z.infer<typeof NearestDriverSchema>;
export type NearestDriversResponse = z.infer<typeof NearestDriversResponseSchema>;
export type PoolingBatch = z.infer<typeof PoolingBatchSchema>;
export type PoolingResponse = z.infer<typeof PoolingResponseSchema>;

// ============================================
// Fleet / Telemetry
// ============================================

export const TelemetryIngestRequestSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
  speedKmh: z.number().nonnegative().optional(),
});

export const TelemetryIngestResponseSchema = SuccessResponseSchema.extend({
  data: z.object({ queued: z.literal(true) }),
});

export const FleetTelemetrySheetDriverSchema = z.object({
  orderId: z.number().int().positive(),
  cargo: z.string(),
  driver: z.string(),
  currentLocation: CoordinatesSchema,
  destinationLocation: CoordinatesSchema,
  distanceRemainingKm: z.number(),
  estimatedMinutesArrival: z.number().int().positive(),
  telemetryStatus: z.enum(['LIVE', 'STALE_SIGNAL']),
});

export const FleetTelemetrySheetResponseSchema = SuccessResponseSchema.extend({
  data: z.object({
    systemTime: z.string().datetime(),
    activeFleetCount: z.number().int().nonnegative(),
    fleetReport: z.array(FleetTelemetrySheetDriverSchema),
  }),
});

export const DriverBreadcrumbsResponseSchema = SuccessResponseSchema.extend({
  data: z.object({
    driverName: z.string(),
    algorithm: z.string(),
    inputToleranceDegrees: z.number(),
    survivingPointsCount: z.number().int().nonnegative(),
    trail: z.array(z.tuple([z.number(), z.number()])),
  }),
});

export const FleetPerformanceDriverSchema = z.object({
  driverName: z.string(),
  completedDeliveriesCount: z.number().int().nonnegative(),
  averageUnloadingDwellTimeMinutes: z.number(),
  worstCaseDwellTimeMinutes: z.number(),
});

export const FleetPerformanceResponseSchema = SuccessResponseSchema.extend({
  data: z.object({
    generatedAt: z.string().datetime(),
    metricScope: z.string(),
    fleetMetrics: z.array(FleetPerformanceDriverSchema),
  }),
});

export type TelemetryIngestRequest = z.infer<typeof TelemetryIngestRequestSchema>;
export type TelemetryIngestResponse = z.infer<typeof TelemetryIngestResponseSchema>;
export type FleetTelemetrySheetDriver = z.infer<typeof FleetTelemetrySheetDriverSchema>;
export type FleetTelemetrySheetResponse = z.infer<typeof FleetTelemetrySheetResponseSchema>;
export type DriverBreadcrumbsResponse = z.infer<typeof DriverBreadcrumbsResponseSchema>;
export type FleetPerformanceDriver = z.infer<typeof FleetPerformanceDriverSchema>;
export type FleetPerformanceResponse = z.infer<typeof FleetPerformanceResponseSchema>;

// ============================================
// Geofences
// ============================================

export const CreateGeofenceRequestSchema = z.object({
  name: z.string().min(1).max(100),
  coordinates: z.array(z.tuple([z.number().finite(), z.number().finite()])).min(4), // Closed ring
  speedLimitKmh: z.number().int().positive().max(200).default(60),
});

export const GeofenceSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  speedLimitKmh: z.number().int().positive(),
  geojson: z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
  }),
});

export const GeofenceListResponseSchema = SuccessResponseSchema.extend({
  data: z.array(GeofenceSchema),
});

export const GeofenceResponseSchema = SuccessResponseSchema.extend({
  data: z.object({ message: z.string() }),
});

export const GeofenceDeleteResponseSchema = SuccessResponseSchema.extend({
  data: z.object({ deleted: z.literal(true), id: z.number().int().positive() }),
});

export const ImportGeofenceRequestSchema = z.object({
  // GeoJSON FeatureCollection or single Feature
  type: z.enum(['FeatureCollection', 'Feature']),
  features: z.array(z.object({
    type: z.literal('Feature'),
    properties: z.object({
      name: z.string(),
      speedLimitKmh: z.number().int().positive().optional(),
    }),
    geometry: z.object({
      type: z.literal('Polygon'),
      coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
    }),
  })).optional(),
  geometry: z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
  }).optional(),
  properties: z.object({
    name: z.string(),
    speedLimitKmh: z.number().int().positive().optional(),
  }).optional(),
});

export type CreateGeofenceRequest = z.infer<typeof CreateGeofenceRequestSchema>;
export type Geofence = z.infer<typeof GeofenceSchema>;
export type GeofenceListResponse = z.infer<typeof GeofenceListResponseSchema>;
export type GeofenceResponse = z.infer<typeof GeofenceResponseSchema>;
export type GeofenceDeleteResponse = z.infer<typeof GeofenceDeleteResponseSchema>;
export type ImportGeofenceRequest = z.infer<typeof ImportGeofenceRequestSchema>;

// ============================================
// Routes (VRP)
// ============================================

export const VrpStopSchema = z.object({
  id: z.string(),
  lat: z.number().finite(),
  lng: z.number().finite(),
  demand: z.number().int().positive(),
  timeWindow: z.object({
    earliest: z.string().datetime().optional(),
    latest: z.string().datetime().optional(),
  }).optional(),
});

export const VrpVehicleSchema = z.object({
  id: z.number().int().positive(),
  capacity: z.number().int().positive(),
  shift: z.object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
  }).optional(),
});

export const VrpDepotSchema = z.object({
  id: z.string(),
  lat: z.number().finite(),
  lng: z.number().finite(),
});

export const VrpOptimizeRequestSchema = z.object({
  depot: VrpDepotSchema,
  vehicles: z.array(VrpVehicleSchema).min(1),
  stops: z.array(VrpStopSchema).min(1),
  vehicleCapacity: z.number().int().positive().default(100),
});

export const VrpRouteSchema = z.object({
  vehicleId: z.number().int().positive(),
  sequence: z.array(VrpStopSchema),
  totalDistanceKm: z.number(),
  totalLoad: z.number().int().nonnegative(),
});

export const VrpOptimizeResponseSchema = SuccessResponseSchema.extend({
  data: z.object({
    routes: z.array(VrpRouteSchema),
    summary: z.object({
      totalVehiclesNeeded: z.number().int().positive(),
      aggregateDistanceKm: z.number(),
    }),
  }),
});

export const SaveRouteRequestSchema = z.object({
  driverName: z.string(),
  coordinates: z.array(z.tuple([z.number().finite(), z.number().finite()])).min(2),
});

export const CommitRouteRequestSchema = z.object({
  vehicleId: z.number().int().positive(),
  driverName: z.string(),
  geojsonPath: z.union([
    z.array(z.tuple([z.number().finite(), z.number().finite()])),
    z.object({
      type: z.literal('LineString'),
      coordinates: z.array(z.tuple([z.number().finite(), z.number().finite()])),
    }),
  ]),
  aggregateDistanceKm: z.number(),
  totalDemand: z.number().int().nonnegative(),
});

export const RouteSchema = z.object({
  id: z.number().int().positive(),
  vehicleId: z.number().int().positive(),
  driverName: z.string(),
  geojsonPath: z.object({
    type: z.literal('LineString'),
    coordinates: z.array(z.tuple([z.number(), z.number()])),
  }),
  aggregateDistanceKm: z.number(),
  totalDemand: z.number().int().nonnegative(),
  status: z.enum(['SNAPSHOT', 'COMMITTED']),
  createdAt: z.string().datetime(),
});

export const RouteListResponseSchema = SuccessResponseSchema.extend({
  data: z.array(RouteSchema),
});

export const RouteResponseSchema = SuccessResponseSchema.extend({
  data: RouteSchema,
});

export type VrpStop = z.infer<typeof VrpStopSchema>;
export type VrpVehicle = z.infer<typeof VrpVehicleSchema>;
export type VrpDepot = z.infer<typeof VrpDepotSchema>;
export type VrpOptimizeRequest = z.infer<typeof VrpOptimizeRequestSchema>;
export type VrpRoute = z.infer<typeof VrpRouteSchema>;
export type VrpOptimizeResponse = z.infer<typeof VrpOptimizeResponseSchema>;
export type SaveRouteRequest = z.infer<typeof SaveRouteRequestSchema>;
export type CommitRouteRequest = z.infer<typeof CommitRouteRequestSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type RouteListResponse = z.infer<typeof RouteListResponseSchema>;
export type RouteResponse = z.infer<typeof RouteResponseSchema>;


// ============================================
// Dispatch
// ============================================

export const DispatchMatrixRequestSchema = z.object({
  targetLat: z.number().finite(),
  targetLng: z.number().finite(),
  activeFleet: z.array(z.object({
    driverName: z.string(),
    lat: z.number().finite(),
    lng: z.number().finite(),
  })).min(1),
});

export const DispatchMatrixDriverSchema = z.object({
  driverName: z.string(),
  distanceKm: z.number(),
  etaMinutes: z.number().int().positive(),
});

export const DispatchMatrixResponseSchema = SuccessResponseSchema.extend({
  data: z.object({
    rankings: z.array(DispatchMatrixDriverSchema),
  }),
});

export type DispatchMatrixRequest = z.infer<typeof DispatchMatrixRequestSchema>;
export type DispatchMatrixDriver = z.infer<typeof DispatchMatrixDriverSchema>;
export type DispatchMatrixResponse = z.infer<typeof DispatchMatrixResponseSchema>;

// ============================================
// Incidents
// ============================================

export const CreateIncidentRequestSchema = z.object({
  orderId: z.number().int().positive().optional(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
});

export const IncidentSchema = z.object({
  id: z.number().int().positive(),
  orderId: z.number().int().positive().nullable(),
  driverName: z.string(),
  eventType: z.string(),
  description: z.string(),
  acknowledged: z.boolean().default(false),
  acknowledgedAt: z.string().datetime().nullable(),
  acknowledgedBy: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const IncidentListResponseSchema = SuccessResponseSchema.extend({
  data: z.array(IncidentSchema),
});

export const AcknowledgeIncidentRequestSchema = z.object({
  acknowledged: z.literal(true),
});

export type CreateIncidentRequest = z.infer<typeof CreateIncidentRequestSchema>;
export type Incident = z.infer<typeof IncidentSchema>;
export type IncidentListResponse = z.infer<typeof IncidentListResponseSchema>;
export type AcknowledgeIncidentRequest = z.infer<typeof AcknowledgeIncidentRequestSchema>;


// ============================================
// Delivery Stops (Depots)
// ============================================

export const CreateStopRequestSchema = z.object({
  name: z.string().min(1).max(100),
  lat: z.number().finite(),
  lng: z.number().finite(),
  demand: z.number().int().positive().default(1),
});

export const StopSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  lat: z.number().finite(),
  lng: z.number().finite(),
  demand: z.number().int().positive(),
});

export const StopListResponseSchema = SuccessResponseSchema.extend({
  data: z.array(StopSchema),
});

export const StopResponseSchema = SuccessResponseSchema.extend({
  data: StopSchema,
});

export const StopDeleteResponseSchema = SuccessResponseSchema.extend({
  data: z.object({ deleted: z.literal(true), id: z.number().int().positive() }),
});

export type CreateStopRequest = z.infer<typeof CreateStopRequestSchema>;
export type Stop = z.infer<typeof StopSchema>;
export type StopListResponse = z.infer<typeof StopListResponseSchema>;
export type StopResponse = z.infer<typeof StopResponseSchema>;
export type StopDeleteResponse = z.infer<typeof StopDeleteResponseSchema>;


// ============================================
// Notifications (Push)
// ============================================

export const RegisterPushTokenRequestSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web', 'unknown']).optional(),
});

export const RegisterPushTokenResponseSchema = SuccessResponseSchema.extend({
  data: z.object({ registered: z.literal(true) }),
});

export type RegisterPushTokenRequest = z.infer<typeof RegisterPushTokenRequestSchema>;
export type RegisterPushTokenResponse = z.infer<typeof RegisterPushTokenResponseSchema>;


// ============================================
// Vehicles
// ============================================

export const CreateVehicleRequestSchema = z.object({
  name: z.string().min(1).max(50), // plate number
  type: z.string().min(1).max(50),
});

export const VehicleSchema = z.object({
  id: z.number().int().positive(),
  plateNumber: z.string(),
  vehicleType: z.string(),
  currentDriverId: z.number().int().positive().nullable(),
  status: z.string(),
});

export const VehicleListResponseSchema = SuccessResponseSchema.extend({
  data: z.array(VehicleSchema),
});

export const VehicleResponseSchema = SuccessResponseSchema.extend({
  data: VehicleSchema,
});

export const AssignVehicleRequestSchema = z.object({
  driverId: z.number().int().positive(),
});

export type CreateVehicleRequest = z.infer<typeof CreateVehicleRequestSchema>;
export type Vehicle = z.infer<typeof VehicleSchema>;
export type VehicleListResponse = z.infer<typeof VehicleListResponseSchema>;
export type VehicleResponse = z.infer<typeof VehicleResponseSchema>;
export type AssignVehicleRequest = z.infer<typeof AssignVehicleRequestSchema>;


// ============================================
// Audit Logs
// ============================================

export const AuditLogSchema = z.object({
  id: z.number().int().positive(),
  actionType: z.string(),
  description: z.string(),
  username: z.string(),
  timestamp: z.string().datetime(),
});

export const AuditLogListResponseSchema = SuccessResponseSchema.extend({
  data: z.array(AuditLogSchema),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;
export type AuditLogListResponse = z.infer<typeof AuditLogListResponseSchema>;


// ============================================
// System / Health
// ============================================

export const HealthResponseSchema = SuccessResponseSchema.extend({
  data: z.object({
    status: z.literal('ok'),
    service: z.string(),
    uptimeSeconds: z.number().int().nonnegative(),
  }),
});

export const ReadyResponseSchema = SuccessResponseSchema.extend({
  data: z.object({
    status: z.literal('ready'),
    database: z.literal('ok'),
  }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ReadyResponse = z.infer<typeof ReadyResponseSchema>;