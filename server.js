const express = require("express");
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const path = require("path");
const session = require("express-session");

// Firebase service account
const serviceAccount = require("./firebase-key.json");

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
const PORT = 5000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Session setup
app.use(
  session({
    secret: "yourSecretKey",
    resave: false,
    saveUninitialized: true,
  })
);

// Set EJS as view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ------------------ Authentication Middleware ------------------
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    res.redirect("/login");
  }
}

// ------------------ Auth Routes ------------------

// Show signup form
app.get("/signup", (req, res) => {
  res.render("signup", { error: null });
});

// Handle signup
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  try {
    const userRecord = await admin.auth().createUser({ email, password });
    res.redirect("/login");
  } catch (error) {
    res.render("signup", { error: error.message });
  }
});

// Show login form
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// Handle login
app.post("/login", async (req, res) => {
  const { email } = req.body;
  try {
    const user = await admin.auth().getUserByEmail(email);
    req.session.user = { uid: user.uid, email: user.email };
    res.redirect("/");
  } catch (error) {
    res.render("login", { error: error.message });
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// ------------------ Protected Routes ------------------

// Home page
app.get("/", isAuthenticated, (req, res) => {
  res.render("home", { user: req.session.user });
});

// Show add-meal form
app.get("/add-meal", isAuthenticated, (req, res) => {
  res.render("addMeal", { success: null });
});

// Handle add-meal submission with userId
app.post("/add-meal", isAuthenticated, async (req, res) => {
  const { mealName, ingredients, time } = req.body;
  const userId = req.session.user.uid;

  try {
    await db.collection("meals").add({
      mealName,
      ingredients,
      time,
      userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.render("addMeal", { success: "✅ Meal added successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error saving meal.");
  }
});

// Show all meals of the logged-in user
app.get("/meals", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.uid;
    const snapshot = await db.collection("meals")
      .where("userId", "==", userId)
      .get();

    const meals = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds); // newest first

    res.render("meals", { meals });
  } catch (error) {
    console.error("❌ Error fetching meals:", error);
    res.status(500).send("Error loading meals.");
  }
});

// Generate weekly plan for the logged-in user
app.get("/weekly-plan", isAuthenticated, async (req, res) => {
  const userId = req.session.user.uid;

  try {
    const snapshot = await db.collection("meals").where("userId", "==", userId).get();
    const meals = snapshot.docs.map(doc => ({ ...doc.data() }));

    const breakfastMeals = meals.filter(m => m.time === "Breakfast");
    const lunchMeals = meals.filter(m => m.time === "Lunch");
    const dinnerMeals = meals.filter(m => m.time === "Dinner");

    const pickRandom = arr => arr[Math.floor(Math.random() * arr.length)];
    const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const weekPlan = days.map(day => ({
      day,
      breakfast: breakfastMeals.length ? pickRandom(breakfastMeals) : null,
      lunch: lunchMeals.length ? pickRandom(lunchMeals) : null,
      dinner: dinnerMeals.length ? pickRandom(dinnerMeals) : null,
    }));

    res.render("weeklyplan", { weekPlan });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error generating weekly plan.");
  }
});

// Generate shopping list for logged-in user
app.get("/shopping-list", isAuthenticated, async (req, res) => {
  const userId = req.session.user.uid;
  try {
    const snapshot = await db.collection("meals").where("userId", "==", userId).get();
    const meals = snapshot.docs.map(doc => ({ ...doc.data() }));

    const breakfastMeals = meals.filter(m => m.time === "Breakfast");
    const lunchMeals = meals.filter(m => m.time === "Lunch");
    const dinnerMeals = meals.filter(m => m.time === "Dinner");

    const pickRandom = arr => arr[Math.floor(Math.random() * arr.length)];
    const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const weekPlan = days.map(day => ({
      day,
      breakfast: breakfastMeals.length ? pickRandom(breakfastMeals) : null,
      lunch: lunchMeals.length ? pickRandom(lunchMeals) : null,
      dinner: dinnerMeals.length ? pickRandom(dinnerMeals) : null,
    }));

    // Consolidate all ingredients
    let allIngredients = [];
    weekPlan.forEach(day => {
      [day.breakfast, day.lunch, day.dinner].forEach(meal => {
        if (meal && meal.ingredients) {
          allIngredients.push(...meal.ingredients.split(",").map(i => i.trim()));
        }
      });
    });

    const uniqueIngredients = [...new Set(allIngredients)];
    res.render("shoppingList", { uniqueIngredients });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error generating shopping list.");
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
