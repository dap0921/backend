import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },

    password: {
      type: String,
      required: true
    },

    phone: {
      type: String,
      required: false,
      default: ""
    },

    address: {
      type: String,
      required: false,
      default: ""
    },
    profileImage: {
  type: String,
  default: ""
},

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    }
  },
  {
    timestamps: true,
    collection: "userdata"
  }
);

const userData = mongoose.model("userData", userSchema);

export default userData;