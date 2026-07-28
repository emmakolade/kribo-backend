import { DisputeModel, type DisputeDocument } from '../models/dispute.model';

export async function listDisputes(): Promise<DisputeDocument[]> {
  return DisputeModel.find().lean<DisputeDocument[]>();
}

export async function resolveDispute(
  disputeId: string,
  resolutionNotes: string,
  resolvedBy: string,
): Promise<DisputeDocument | null> {
  return DisputeModel.findByIdAndUpdate(
    disputeId,
    { status: 'resolved', resolutionNotes, resolvedBy },
    { returnDocument: 'after' },
  ).lean<DisputeDocument | null>();
}
