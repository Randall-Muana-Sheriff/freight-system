import { describe, it, expect } from 'vitest';
import {
  // Auth
  SignupRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
  TokenPairSchema,
  UserRoleEnum,
  // Users
  UserSchema,
  // Orders
  OrderStatusEnum,
  CreateOrderRequestSchema,
  OrderSchema,
  // Fleet
  TelemetryIngestRequestSchema,
  FleetTelemetrySheetDriverSchema,
  // Geofences
  CreateGeofenceRequestSchema,
  GeofenceSchema,
  // Routes
  VrpOptimizeRequestSchema,
  VrpRouteSchema,
  RouteSchema,
  // Dispatch
  DispatchMatrixRequestSchema,
  // Incidents
  CreateIncidentRequestSchema,
  IncidentSchema,
  // Stops
  CreateStopRequestSchema,
  StopSchema,
  // Notifications
  RegisterPushTokenRequestSchema,
  // Vehicles
  CreateVehicleRequestSchema,
  VehicleSchema,
  // Audit
  AuditLogSchema,
  // System
  HealthResponseSchema,
  ReadyResponseSchema,
  // Common
  SuccessResponseSchema,
  ErrorResponseSchema,
  ApiResponseSchema,
  PaginationQuerySchema,
  CoordinatesSchema,
} from '../schemas/index.js';

describe('Auth Schemas', () => {
  it('validates signup request', () => {
    const valid = { username: 'driver1', password: 'password123' };
    expect(SignupRequestSchema.parse(valid)).toEqual(valid);
  });

  it('rejects short username', () => {
    expect(() => SignupRequestSchema.parse({ username: 'ab', password: 'password123' })).toThrow();
  });

  it('rejects short password', () => {
    expect(() => SignupRequestSchema.parse({ username: 'driver1', password: '123' })).toThrow();
  });

  it('validates login request', () => {
    const valid = { username: 'driver1', password: 'password123' };
    expect(LoginRequestSchema.parse(valid)).toEqual(valid);
  });

  it('validates refresh request', () => {
    const valid = { refreshToken: 'abc123' };
    expect(RefreshRequestSchema.parse(valid)).toEqual(valid);
  });

  it('validates token pair', () => {
    const valid = { accessToken: 'access', refreshToken: 'refresh', role: 'driver' };
    expect(TokenPairSchema.parse(valid)).toEqual(valid);
  });

  it('rejects invalid role', () => {
    expect(() => TokenPairSchema.parse({ accessToken: 'a', refreshToken: 'r', role: 'invalid' })).toThrow();
  });

  it('validates user roles', () => {
    expect(UserRoleEnum.parse('admin')).toBe('admin');
    expect(UserRoleEnum.parse('dispatcher')).toBe('dispatcher');
    expect(UserRoleEnum.parse('driver')).toBe('driver');
    expect(UserRoleEnum.parse('merchant')).toBe('merchant');
    expect(() => UserRoleEnum.parse('invalid')).toThrow();
  });
});

describe('User Schemas', () => {
  it('validates user schema', () => {
    const valid = {
      id: 1,
      username: 'driver1',
      email: 'driver@example.com',
      role: 'driver',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    expect(UserSchema.parse(valid)).toEqual(valid);
  });

  it('allows null email', () => {
    const valid = {
      id: 1,
      username: 'driver1',
      email: null,
      role: 'driver',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    expect(UserSchema.parse(valid)).toEqual(valid);
  });
});

describe('Order Schemas', () => {
  it('validates create order request', () => {
    const valid = {
      cargoDescription: 'Electronics',
      weightKg: 100,
      originHubName: 'Central Hub',
      pickupLng: 30.0,
      pickupLat: -1.95,
      deliveryLng: 30.1,
      deliveryLat: -1.96,
    };
    expect(CreateOrderRequestSchema.parse(valid)).toEqual(valid);
  });

  it('rejects negative weight', () => {
    expect(() => CreateOrderRequestSchema.parse({ ...validOrder(), weightKg: -1 })).toThrow();
  });

  it('validates order status enum', () => {
    const statuses = ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'CANCELLED'];
    statuses.forEach(s => expect(OrderStatusEnum.parse(s)).toBe(s));
    expect(() => OrderStatusEnum.parse('INVALID')).toThrow();
  });

  it('validates order schema', () => {
    const valid = {
      id: 1,
      cargoDescription: 'Electronics',
      status: 'PENDING',
      weightKg: 100,
      originHubName: 'Central Hub',
      pickupLng: 30.0,
      pickupLat: -1.95,
      deliveryLng: 30.1,
      deliveryLat: -1.96,
      driverId: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    expect(OrderSchema.parse(valid)).toEqual(valid);
  });
});

function validOrder() {
  return {
    cargoDescription: 'Electronics',
    weightKg: 100,
    originHubName: 'Central Hub',
    pickupLng: 30.0,
    pickupLat: -1.95,
    deliveryLng: 30.1,
    deliveryLat: -1.96,
  };
}

describe('Fleet/Telemetry Schemas', () => {
  it('validates telemetry ingest request', () => {
    const valid = { lat: -1.95, lng: 30.0, speedKmh: 60 };
    expect(TelemetryIngestRequestSchema.parse(valid)).toEqual(valid);
  });

  it('makes speedKmh optional', () => {
    const valid = { lat: -1.95, lng: 30.0 };
    expect(TelemetryIngestRequestSchema.parse(valid)).toEqual(valid);
  });

  it('validates fleet telemetry sheet driver', () => {
    const valid = {
      orderId: 1,
      cargo: 'Electronics',
      driver: 'John Doe',
      currentLocation: { lat: -1.95, lng: 30.0 },
      destinationLocation: { lat: -1.96, lng: 30.1 },
      distanceRemainingKm: 5.5,
      estimatedMinutesArrival: 10,
      telemetryStatus: 'LIVE',
    };
    expect(FleetTelemetrySheetDriverSchema.parse(valid)).toEqual(valid);
  });
});

describe('Geofence Schemas', () => {
  it('validates create geofence request', () => {
    const valid = {
      name: 'Kigali CBD',
      coordinates: [
        [30.0, -1.95],
        [30.1, -1.95],
        [30.1, -1.96],
        [30.0, -1.96],
        [30.0, -1.95], // closed ring
      ],
      speedLimitKmh: 50,
    };
    expect(CreateGeofenceRequestSchema.parse(valid)).toEqual(valid);
  });

  it('defaults speedLimitKmh to 60', () => {
    const valid = {
      name: 'Kigali CBD',
      coordinates: [
        [30.0, -1.95],
        [30.1, -1.95],
        [30.1, -1.96],
        [30.0, -1.96],
        [30.0, -1.95],
      ],
    };
    const parsed = CreateGeofenceRequestSchema.parse(valid);
    expect(parsed.speedLimitKmh).toBe(60);
  });

  it('rejects unclosed ring (less than 4 points)', () => {
    expect(() => CreateGeofenceRequestSchema.parse({
      name: 'Test',
      coordinates: [[30.0, -1.95], [30.1, -1.95], [30.1, -1.96]],
    })).toThrow();
  });

  it('validates geofence schema with GeoJSON', () => {
    const valid = {
      id: 1,
      name: 'Kigali CBD',
      speedLimitKmh: 50,
      geojson: {
        type: 'Polygon',
        coordinates: [[
          [30.0, -1.95],
          [30.1, -1.95],
          [30.1, -1.96],
          [30.0, -1.96],
          [30.0, -1.95],
        ]],
      },
    };
    expect(GeofenceSchema.parse(valid)).toEqual(valid);
  });
});

describe('Route/VRP Schemas', () => {
  it('validates VRP optimize request', () => {
    const valid = {
      depot: { id: 'depot1', lat: -1.95, lng: 30.0 },
      vehicles: [{ id: 1, capacity: 100 }],
      stops: [
        { id: 'stop1', lat: -1.96, lng: 30.1, demand: 10 },
        { id: 'stop2', lat: -1.97, lng: 30.2, demand: 20 },
      ],
    };
    const parsed = VrpOptimizeRequestSchema.parse(valid);
    expect(parsed.vehicleCapacity).toBe(100); // default applied
    expect(parsed.depot).toEqual(valid.depot);
    expect(parsed.vehicles).toEqual(valid.vehicles);
    expect(parsed.stops).toEqual(valid.stops);
  });

  it('validates VRP route schema', () => {
    const valid = {
      vehicleId: 1,
      sequence: [
        { id: 'stop1', lat: -1.96, lng: 30.1, demand: 10 },
        { id: 'stop2', lat: -1.97, lng: 30.2, demand: 20 },
      ],
      totalDistanceKm: 15.5,
      totalLoad: 30,
    };
    expect(VrpRouteSchema.parse(valid)).toEqual(valid);
  });

  it('validates saved route schema', () => {
    const valid = {
      id: 1,
      vehicleId: 1,
      driverName: 'John Doe',
      geojsonPath: {
        type: 'LineString',
        coordinates: [[30.0, -1.95], [30.1, -1.96]],
      },
      aggregateDistanceKm: 10.5,
      totalDemand: 30,
      status: 'COMMITTED',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    expect(RouteSchema.parse(valid)).toEqual(valid);
  });
});

describe('Dispatch Schemas', () => {
  it('validates dispatch matrix request', () => {
    const valid = {
      targetLat: -1.95,
      targetLng: 30.0,
      activeFleet: [
        { driverName: 'John', lat: -1.94, lng: 30.05 },
        { driverName: 'Jane', lat: -1.96, lng: 29.95 },
      ],
    };
    expect(DispatchMatrixRequestSchema.parse(valid)).toEqual(valid);
  });

  it('requires at least one driver in fleet', () => {
    expect(() => DispatchMatrixRequestSchema.parse({
      targetLat: -1.95,
      targetLng: 30.0,
      activeFleet: [],
    })).toThrow();
  });
});

describe('Incident Schemas', () => {
  it('validates create incident request', () => {
    const valid = {
      orderId: 1,
      title: 'Accident',
      description: 'Vehicle collision on main road',
    };
    expect(CreateIncidentRequestSchema.parse(valid)).toEqual(valid);
  });

  it('makes orderId optional', () => {
    const valid = { title: 'Breakdown', description: 'Engine failure' };
    expect(CreateIncidentRequestSchema.parse(valid)).toEqual(valid);
  });

  it('validates incident schema', () => {
    const valid = {
      id: 1,
      orderId: 1,
      driverName: 'John',
      eventType: 'ACCIDENT',
      description: 'Collision',
      acknowledged: false,
      acknowledgedAt: null,
      acknowledgedBy: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    expect(IncidentSchema.parse(valid)).toEqual(valid);
  });
});

describe('Stop/Depot Schemas', () => {
  it('validates create stop request', () => {
    const valid = { name: 'Warehouse A', lat: -1.95, lng: 30.0, demand: 5 };
    expect(CreateStopRequestSchema.parse(valid)).toEqual(valid);
  });

  it('defaults demand to 1', () => {
    const valid = { name: 'Warehouse A', lat: -1.95, lng: 30.0 };
    const parsed = CreateStopRequestSchema.parse(valid);
    expect(parsed.demand).toBe(1);
  });

  it('validates stop schema', () => {
    const valid = { id: 1, name: 'Warehouse A', lat: -1.95, lng: 30.0, demand: 5 };
    expect(StopSchema.parse(valid)).toEqual(valid);
  });
});

describe('Notification Schemas', () => {
  it('validates register push token request', () => {
    const valid = { token: 'fcm-token-123', platform: 'android' };
    expect(RegisterPushTokenRequestSchema.parse(valid)).toEqual(valid);
  });

  it('makes platform optional', () => {
    const valid = { token: 'fcm-token-123' };
    expect(RegisterPushTokenRequestSchema.parse(valid)).toEqual(valid);
  });

  it('validates platform enum', () => {
    expect(RegisterPushTokenRequestSchema.parse({ token: 't', platform: 'ios' })).toBeDefined();
    expect(() => RegisterPushTokenRequestSchema.parse({ token: 't', platform: 'invalid' })).toThrow();
  });
});

describe('Vehicle Schemas', () => {
  it('validates create vehicle request', () => {
    const valid = { name: 'RAB123A', type: 'Truck' };
    expect(CreateVehicleRequestSchema.parse(valid)).toEqual(valid);
  });

  it('validates vehicle schema', () => {
    const valid = {
      id: 1,
      plateNumber: 'RAB123A',
      vehicleType: 'Truck',
      currentDriverId: 5,
      status: 'ACTIVE',
    };
    expect(VehicleSchema.parse(valid)).toEqual(valid);
  });
});

describe('Audit Log Schemas', () => {
  it('validates audit log schema', () => {
    const valid = {
      id: 1,
      actionType: 'ORDER_CREATED',
      description: 'Order #123 created by dispatcher',
      username: 'dispatcher1',
      timestamp: '2024-01-01T00:00:00.000Z',
    };
    expect(AuditLogSchema.parse(valid)).toEqual(valid);
  });
});

describe('System/Health Schemas', () => {
  it('validates health response', () => {
    const valid = { status: 'ok', service: 'kigali-freight-router', uptimeSeconds: 3600 };
    expect(HealthResponseSchema.parse({ success: true, data: valid })).toEqual({ success: true, data: valid });
  });

  it('validates ready response', () => {
    const valid = { status: 'ready', database: 'ok' };
    expect(ReadyResponseSchema.parse({ success: true, data: valid })).toEqual({ success: true, data: valid });
  });
});

describe('Common Schemas', () => {
  it('validates success response', () => {
    const valid = { success: true, data: { foo: 'bar' } };
    expect(SuccessResponseSchema.parse(valid)).toEqual(valid);
  });

  it('validates error response', () => {
    const valid = { success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } };
    expect(ErrorResponseSchema.parse(valid)).toEqual(valid);
  });

  it('validates api response union', () => {
    expect(ApiResponseSchema.parse({ success: true, data: {} })).toBeDefined();
    expect(ApiResponseSchema.parse({ success: false, error: { code: 'ERR', message: 'msg' } })).toBeDefined();
  });

  it('validates pagination query with defaults', () => {
    const parsed = PaginationQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });

  it('validates pagination query with custom values', () => {
    const parsed = PaginationQuerySchema.parse({ page: '2', limit: '50' });
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(50);
  });

  it('validates coordinates', () => {
    const valid = { lat: -1.95, lng: 30.0 };
    expect(CoordinatesSchema.parse(valid)).toEqual(valid);
  });

  it('rejects infinite coordinates', () => {
    expect(() => CoordinatesSchema.parse({ lat: Infinity, lng: 30.0 })).toThrow();
    expect(() => CoordinatesSchema.parse({ lat: -1.95, lng: NaN })).toThrow();
  });
});