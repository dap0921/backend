
import mongoose from 'mongoose';

const sharedGroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },

    description: {
      type: String,
      trim: true,
      default: ''
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'userData',
      required: true
    },

    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'userData',
        required: true
      }
    ]
  },
  {
    timestamps: true,
    collection: 'sharedGroups'
  }
);

// Avoid adding the same member more than once.
sharedGroupSchema.path('members').validate(
  function (members) {
    const ids = members.map(id => id.toString());
    return new Set(ids).size === ids.length;
  },
  'A user cannot be added to the same group more than once.'
);

const sharedGroup = mongoose.model(
  'SharedGroup',
  sharedGroupSchema
);

export default sharedGroup;
