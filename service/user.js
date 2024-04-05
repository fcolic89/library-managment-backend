const bcrypt = require('bcrypt');
const {
  User, Checkout, userRoles,
} = require('../database/models');
const { generateToken, isValidId } = require('../lib/misc');
const error = require('../middleware/errorHandling/errorConstants');

const addUser = async (req, res) => {
  const {
    username, password, email, firstname, lastname, role,
  } = req.body;

  const dbUser = await User.findOne({
    $or: [
      { email },
      { username },
    ],
  }).lean();
  if (dbUser) {
    if (dbUser.email === email) {
      throw new Error(error.DUPLICATE_EMAIL);
    } else {
      throw new Error(error.DUPLICATE_USERNAME);
    }
  }

  const enpass = await bcrypt.hash(password, 10);
  const user = new User({
    username,
    password: enpass,
    email,
    firstname,
    lastname,
  });
  if (role) {
    user.role = role;
    if (role === userRoles.admin) {
      user.canComment = false;
      user.takeBook = false;
    }
  }
  await user.save();
  return res.send({ message: 'New user saved!' });
};

const registerUser = async (req, res) => {
  const {
    username, password, email, firstname, lastname,
  } = req.body;

  const dbUser = await User.findOne({
    $or: [
      { email },
      { username },
    ],
  }).lean();
  if (dbUser) {
    if (dbUser.email === email) {
      throw new Error(error.DUPLICATE_EMAIL);
    } else {
      throw new Error(error.DUPLICATE_USERNAME);
    }
  }

  const enpass = await bcrypt.hash(password, 10);
  const user = new User({
    username,
    password: enpass,
    email,
    firstname,
    lastname,
  });

  await user.save();
  return res.send({ message: 'New user saved!' });
};

const deleteUser = async (req, res) => {
  const { id: userId } = req.params;

  if (!isValidId(userId)) {
    throw new Error(error.INVALID_VALUE);
  }

  const user = await User.findOne({ _id: userId }).lean();
  if (!user) {
    throw new Error(error.NOT_FOUND);
  }

  const checkouts = await Checkout.findOne({ userId, returned: false }).lean();
  if (checkouts) {
    throw new Error(error.DELETE_USER_UNRETURNED);
  }

  User.deleteOne({ _id: userId }).lean();

  return res.json({ message: 'User deleted!' });
};

const updateUser = async (req, res) => {
  const { _id: userId } = req.user;
  const {
    username, firstname, lastname, email,
  } = req.body;

  const [user, sameUser] = await Promise.all([
    User.findOne({ _id: userId }).lean(),
    User.findOne({
      $or: [
        { username },
        { email },
      ],
      _id: { $nin: [userId] },
    }).lean(),
  ]);
  if (!user) {
    throw new Error(error.NOT_FOUND);
  } else if (sameUser) {
    if (sameUser.email === email) {
      throw new Error(error.DUPLICATE_EMAIL);
    } else {
      throw new Error(error.DUPLICATE_USERNAME);
    }
  }

  await User.updateOne({ _id: userId }, {
    username, email, firstname, lastname,
  });

  const token = generateToken(user._id, user.username, user.role, user.canComment, user.takeBook);
  return res.json({ jwt: token });
};

const findUserById = async (req, res) => {
  const { id: userId } = req.params;

  if (!isValidId(userId)) {
    throw new Error(error.INVALID_VALUE);
  }

  const user = await User.findOne({ _id: userId }).lean();
  if (!user) {
    throw new Error(error.NOT_FOUND);
  }

  delete user.password;
  delete user.role;
  user.id = user._id;
  delete user._id;

  return res.send(user);
};

const findUser = async (req, res) => {
  const {
    username, email, firstname, lastname,
  } = req.query;
  let { role } = req.query;
  const { page = 1, size = 10 } = req.query;

  if (!role) role = Object.values(userRoles);
  else role = role.trim().split(',');

  const limit = Number(size) + 1;
  const skip = (Number(page) - 1) * Number(size);

  if (Number.isNaN(limit) || Number.isNaN(skip)) {
    throw new Error(error.INVALID_VALUE);
  }

  const userFilter = {
    username: new RegExp(username, 'i'),
    email: new RegExp(email, 'i'),
    firstname: new RegExp(firstname, 'i'),
    lastname: new RegExp(lastname, 'i'),
    role: { $in: role },
  };

  const userList = await User.find(userFilter)
    .limit(limit)
    .skip(skip)
    .sort({ username: 1 });

  let hasNext = false;
  if (userList.length === limit) {
    hasNext = true;
    userList.pop();
  }

  return res.send({
    hasNext,
    users: userList,
  });
};

const getUserInformation = async (req, res) => {
  const { _id: userId } = req.user;
  const user = await User.findOne({ _id: userId }).lean();
  if (!user) {
    throw new Error(error.NOT_FOUND);
  }
  delete user.password;
  delete user.role;
  user.id = user._id;
  delete user._id;

  return res.send(user);
};

const changeCommentPriv = async (req, res) => {
  const { id: userId } = req.body;

  const user = await User.findOne({ _id: userId }).lean();
  if (!user) {
    throw new Error(error.NOT_FOUND);
  }

  const { modifiedCount } = await User.updateOne({ _id: userId, role: { $nin: [userRoles.admin] } }, { canComment: !user.canComment }).lean();
  if (modifiedCount === 0) {
    throw new Error(error.CANT_CHANGE_ADMIN);
  }

  return res.json({ message: 'Privilege changed!' });
};

const changeTakeBookPriv = async (req, res) => {
  const { id: userId } = req.body;

  const user = await User.findOne({ _id: userId }).lean();
  if (!user) {
    throw new Error(error.NOT_FOUND);
  }

  const { modifiedCount } = await User.updateOne({ _id: userId, role: { $nin: [userRoles.admin] } }, { takeBook: !user.takeBook }).lean();
  if (modifiedCount === 0) {
    throw new Error(error.CANT_CHANGE_ADMIN);
  }

  return res.json({ message: 'Privilege changed!' });
};

const changePassword = async (req, res) => {
  const { _id: userId } = req.user;
  const { password } = req.body;
  const user = await User.findOne({ _id: userId }).lean();
  if (!user) {
    throw new Error(error.NOT_FOUND);
  }

  const pass = await bcrypt.hash(password, 10);
  const { modifiedCount } = await User.updateOne({ _id: userId }, { password: pass }).lena();
  if (modifiedCount === 0) {
    throw new Error(error.USER_UPDATE_FAIL);
  }

  return res.json({ message: 'Password changed successfully' });
};

module.exports = {
  registerUser,
  addUser,
  deleteUser,
  updateUser,
  findUserById,
  getUserInformation,
  changePassword,
  findUser,
  changeCommentPriv,
  changeTakeBookPriv,
};
