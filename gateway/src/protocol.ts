/**
 * Gateway Protocol Definitions
 * Using TypeBox for runtime validation
 */

import { Type, Static } from '@sinclair/typebox';

// Platform types
export const PlatformSchema = Type.Union([
    Type.Literal('whatsapp'),
    Type.Literal('telegram'),
    Type.Literal('simulator')
]);

export type Platform = Static<typeof PlatformSchema>;

// Message request
export const MessageRequestSchema = Type.Object({
    userId: Type.String(),
    platform: PlatformSchema,
    message: Type.String(),
    idempotencyKey: Type.String(),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Any()))
});

export type MessageRequest = Static<typeof MessageRequestSchema>;

// Message response
export const MessageResponseSchema = Type.Object({
    message: Type.String(),
    buttons: Type.Optional(Type.Array(Type.Array(Type.Object({
        text: Type.String(),
        callback_data: Type.String()
    })))),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Any()))
});

export type MessageResponse = Static<typeof MessageResponseSchema>;

// Document upload request
export const DocumentUploadSchema = Type.Object({
    userId: Type.String(),
    platform: PlatformSchema,
    documentUrl: Type.String(),
    documentType: Type.Union([
        Type.Literal('bank_statement'),
        Type.Literal('invoice'),
        Type.Literal('receipt'),
        Type.Literal('tax_document')
    ]),
    idempotencyKey: Type.String()
});

export type DocumentUpload = Static<typeof DocumentUploadSchema>;

// Session
export const SessionSchema = Type.Object({
    userId: Type.String(),
    platform: PlatformSchema,
    context: Type.Record(Type.String(), Type.Any()),
    createdAt: Type.String(),
    updatedAt: Type.String()
});

export type Session = Static<typeof SessionSchema>;

// Error response
export const ErrorResponseSchema = Type.Object({
    error: Type.String(),
    code: Type.String(),
    details: Type.Optional(Type.Any())
});

export type ErrorResponse = Static<typeof ErrorResponseSchema>;
