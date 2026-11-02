import userData from '../model/user.js';
import bcrypt from 'bcryptjs';
import generateToken from '../scripts/utils/jwtutils.js';

// ======================================================
// ADD USER / REGISTER
// ======================================================
export const addUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      address
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'Name, email and password are required'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check existing email
    const existingUser = await userData.findOne({
      email: cleanEmail
    });

    if (existingUser) {
      return res.status(400).json({
        message: 'Email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // IMPORTANT:
    // Public registration can ONLY create normal users.
    // The role sent by the frontend/client is completely ignored.
    const saveUserData = await userData.create({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      phone: phone?.trim() || '',
      address: address?.trim() || '',
      role: 'user'
    });

    res.status(201).json({
      message: 'User account created successfully',

      data: {
        id: saveUserData._id,
        name: saveUserData.name,
        email: saveUserData.email,
        phone: saveUserData.phone,
        address: saveUserData.address,
        role: saveUserData.role
      }
    });

  } catch (error) {
    console.error('Add user error:', error);

    res.status(500).json({
      message: 'Failed to add user',
      errorMessage: error.message
    });
  }
};


// ======================================================
// GET ALL USERS
// ======================================================
export const getUser = async (req, res) => {
  try {
    const getUserData = await userData
      .find()
      .select('-password');

    res.status(200).json({
      message: 'Users retrieved successfully',
      data: getUserData
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to retrieve users',
      errorMessage: error.message
    });
  }
};


// ======================================================
// LOGIN
// ======================================================
export const loginUser = async (req, res) => {
  try {
    const {
      email,
      password,
      role
    } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({
        message:
          'Email, password and login type are required'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Find user
    const user = await userData.findOne({
      email: cleanEmail
    });

    if (!user) {
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    const userRole = user.role || 'user';

    // Check selected login type
    if (role !== userRole) {
      return res.status(403).json({
        message:
          `This account is registered as ${userRole}. Please select ${userRole} login.`
      });
    }

    // Generate JWT
    const token = generateToken({
      ...user.toObject(),
      role: userRole
    });

    res.status(200).json({
      message: 'Login successful',

      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: userRole
      },

      token
    });

  } catch (error) {
    console.error('Login error:', error);

    res.status(500).json({
      message: 'Login failed',
      errorMessage: error.message
    });
  }
};


// ======================================================
// GET SINGLE USER
// ======================================================
export const getSingleUser = async (req, res) => {
  try {
    const id = req.params.uid;

    const getSingleUserData = await userData
      .findById(id)
      .select('-password');

    if (!getSingleUserData) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    res.status(200).json({
      message: 'User retrieved successfully',
      data: getSingleUserData
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to retrieve user',
      errorMessage: error.message
    });
  }
};


// ======================================================
// UPDATE USER
// ======================================================
export const updateUser = async (req, res) => {
  try {
    const id = req.params.uid;

    const updateUserData = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address
    };

    const updatedData = await userData
      .findByIdAndUpdate(
        id,
        updateUserData,
        {
          new: true,
          runValidators: true
        }
      )
      .select('-password');

    if (!updatedData) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    res.status(200).json({
      message: 'User updated successfully',
      data: updatedData
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to update user',
      errorMessage: error.message
    });
  }
};


// ======================================================
// DELETE USER
// ======================================================
export const deleteUser = async (req, res) => {
  try {
    const id = req.params.uid;

    const deleteUserData =
      await userData.findByIdAndDelete(id);

    if (!deleteUserData) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    res.status(200).json({
      message: 'User deleted successfully',
      data: deleteUserData
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to delete user',
      errorMessage: error.message
    });
  }
};


// ======================================================
// GET LOGGED-IN USER PROFILE
// ======================================================
export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const profile = await userData
      .findById(userId)
      .select('-password');

    if (!profile) {
      return res.status(404).json({
        message: 'User profile not found'
      });
    }

    res.status(200).json({
      message: 'Profile retrieved successfully',
      data: profile
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to retrieve profile',
      errorMessage: error.message
    });
  }
};


// ======================================================
// UPDATE LOGGED-IN USER PROFILE
// ======================================================
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      name,
      email,
      phone,
      address
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        message: 'Name and email are required'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check whether another account already uses this email
    const existingUser = await userData.findOne({
      email: cleanEmail,
      _id: {
        $ne: userId
      }
    });

    if (existingUser) {
      return res.status(400).json({
        message: 'Email already exists'
      });
    }

    const updatedProfile = await userData
      .findByIdAndUpdate(
        userId,
        {
          name: name.trim(),
          email: cleanEmail,
          phone: phone?.trim() || '',
          address: address?.trim() || ''
        },
        {
          new: true,
          runValidators: true
        }
      )
      .select('-password');

    if (!updatedProfile) {
      return res.status(404).json({
        message: 'User profile not found'
      });
    }

    res.status(200).json({
      message: 'Profile updated successfully',
      data: updatedProfile
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to update profile',
      errorMessage: error.message
    });
  }
};