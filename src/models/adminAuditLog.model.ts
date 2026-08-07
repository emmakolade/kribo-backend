import { Schema, model, type InferSchemaType, type Types } from 'mongoose';

const adminAuditLogSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true, index: true },
    resourceId: { type: String, required: true, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

adminAuditLogSchema.index({ createdAt: -1 });

export type AdminAuditLogDocument = InferSchemaType<typeof adminAuditLogSchema> & { _id: Types.ObjectId };
export const AdminAuditLogModel = model('AdminAuditLog', adminAuditLogSchema);
