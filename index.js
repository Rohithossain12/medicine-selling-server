require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const Stripe = require("stripe");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
const app = express();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uv360.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("parmaWorld");
    const userCollection = db.collection("users");
    const medicineCollection = db.collection("medicine");
    const categoryCollection = db.collection("category");
    const cartCollection = db.collection("cart");
    const advertisementCollection = db.collection("advertisements");
    const orderCollection = db.collection("orders");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      const authorization = req.headers?.authorization;
      console.log("inside verify token", req.headers, authorization);
      if (!req.headers?.authorization) {
        return res.status(401).send({ message: "Unauthorized Access" });
      }
      const token = req.headers?.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized Access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // Verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      if (!result || result.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    // Verify Seller middleware
    const verifySeller = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (!user || user.role !== "seller") {
        return res.status(403).send({ message: "forbidden access" });
      }

      next();
    };

    // Check admin
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params?.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      // Check if the user is an admin
      const admin = user?.role === "admin";
      res.send({ admin });
    });

    // Check Seller
    app.get("/users/seller/:email", verifyToken, async (req, res) => {
      const email = req.params?.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);

      const seller = user?.role === "seller";
      res.send({ seller });
    });

    // user related apis
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // updated user role
    app.patch("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params?.id;
      const newRole = req.body.role;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: newRole,
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // user data save in db
    app.post("/users", verifyToken, async (req, res) => {
      const user = req.body;
      // Check if the user already exists based on email
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.status(201).send(existingUser);
      }
      // Save the new user
      const result = await userCollection.insertOne(user);
      res.status(201).send(result);
    });

    // user data update

    app.put("/user/updateProfile/:email", verifyToken, async (req, res) => {
      console.log("Request Params:", req.params);

      const email = req.params.email;
      const filter = { email: email };
      const { name, photo } = req.body;

      const updatedDoc = {
        $set: {
          name,
          photo,
        },
      };

      try {
        const result = await userCollection.updateOne(filter, updatedDoc);
        console.log("Update Result:", result);

        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Profile updated successfully." });
        } else {
          res.status(404).send({ error: "User not found or no changes made." });
        }
      } catch (error) {
        console.error("Error updating user profile:", error);
        res.status(500).send({ error: "Internal server error." });
      }
    });

    // Medicine Related api
    app.get("/allMedicines", async (req, res) => {
      const result = await medicineCollection.find().toArray();
      res.send(result);
    });

    // Get all medicines by category and email
    app.get("/medicines", async (req, res) => {
      const { category, email } = req.query;

      let query = {};

      // Check if category is provided and add it to the query
      if (category) {
        query.category = category;
      }

      // Check if email is provided and add it to the query
      if (email) {
        query.email = email;
      }

      try {
        const result = await medicineCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch medicines", error });
      }
    });

    // filter by discount medicine
    app.get("/discount-products", async (req, res) => {
      try {
        const discountProducts = await medicineCollection
          .aggregate([
            {
              $match: {
                discount: { $type: "string" },
              },
            },
            {
              $addFields: {
                discount: {
                  $toInt: "$discount",
                },
              },
            },
            {
              $match: {
                discount: { $gt: 0 },
              },
            },
          ])
          .toArray();

        if (discountProducts.length > 0) {
          res.status(200).send(discountProducts);
        } else {
          res.status(404).send({ message: "No discounted products found." });
        }
      } catch (error) {
        console.error("Error fetching discounted products:", error);
        res.status(500).send({ error: "Internal server error." });
      }
    });

    //  save medicine data in db
    app.post("/medicines", verifyToken, verifySeller, async (req, res) => {
      const medicineData = req.body;
      const result = await medicineCollection.insertOne(medicineData);
      res.send(result);
    });

    // Update a medicine by ID
    app.put("/medicine/:id", verifyToken, verifySeller, async (req, res) => {
      const id = req.params.id;
      const updateMedicine = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: updateMedicine,
      };
      const result = await medicineCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // Delete a Medicine By ID
    app.delete("/medicine/:id", verifyToken, verifySeller, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await medicineCollection.deleteOne(filter);
      res.send(result);
    });

    // Category related api
    app.get("/categories", async (req, res) => {
      const result = await categoryCollection.find().limit(6).toArray();
      res.send(result);
    });
    // Category related api
    app.get("/category", async (req, res) => {
      const result = await categoryCollection.find().toArray();
      res.send(result);
    });
    //  save category data in db
    app.post("/category", verifyToken, verifyAdmin, async (req, res) => {
      const categoryData = req.body;
      const result = await categoryCollection.insertOne(categoryData);
      res.send(result);
    });

    // Update a category by ID
    app.put("/category/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { categoryName, companyName, categoryImage } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          categoryName,
          categoryImage,
          companyName,
        },
      };
      const result = await categoryCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // Delete a category by ID
    app.delete("/category/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params?.id;
      const query = { _id: new ObjectId(id) };
      const result = await categoryCollection.deleteOne(query);
      res.send(result);
    });

    // cart related api

    app.get("/cart/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const filter = { email };
      const result = await cartCollection.find(filter).toArray();
      res.send(result);
    });

    // save cart data in db
    app.post("/cart", verifyToken, async (req, res) => {
      const addToCart = req.body;
      const result = await cartCollection.insertOne(addToCart);
      res.send(result);
    });
    // update quantity
    app.put("/cart/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { quantity } = req.body;

        const item = await cartCollection.findOne({ _id: new ObjectId(id) });

        if (!item) {
          return res
            .status(404)
            .json({ success: false, message: "Item not found" });
        }

        const totalPrice = parseFloat(item.price) * quantity;

        const result = await cartCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { quantity, totalPrice } }
        );

        if (result.modifiedCount > 0) {
          res.json({
            success: true,
            message: "Quantity updated successfully!",
          });
        } else {
          res.json({ success: false, message: "Failed to update quantity" });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Server error",
          error: error.message,
        });
      }
    });

    // Remove a specific item from the cart
    app.delete("/cart/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });
    // Remove  all item from the cart
    app.delete("/cart", verifyToken, async (req, res) => {
      const result = await cartCollection.deleteMany();
      res.send(result);
    });

    // get all advertisements
    app.get("/advertisements", verifyToken, async (req, res) => {
      const result = await advertisementCollection.find().toArray();
      res.send(result);
    });

    // get specific by advertisements
    app.get("/advertisements/:email", verifyToken, async (req, res) => {
      const email = req.params?.email;
      const filter = { seller: email };
      const result = await advertisementCollection.find(filter).toArray();
      res.send(result);
    });
    // save advertisements in db
    app.post("/advertisements", verifyToken, verifySeller, async (req, res) => {
      const advertisementData = req.body;
      const result = await advertisementCollection.insertOne(advertisementData);
      res.send(result);
    });

    // PATCH endpoint to update advertisement status
    app.patch(
      "/advertisements/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { status } = req.body;

        try {
          if (!ObjectId.isValid(id)) {
            return res.status(400).send({ error: "Invalid advertisement ID." });
          }

          const result = await advertisementCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status } }
          );

          if (result.modifiedCount > 0) {
            res.send({
              success: true,
              message: "Status updated successfully.",
            });
          } else {
            res
              .status(404)
              .send({ success: false, message: "Advertisement not found." });
          }
        } catch (error) {
          console.error("Failed to update status:", error);
          res
            .status(500)
            .send({ success: false, message: "Internal server error." });
        }
      }
    );

    // orders related apis

    // Get order details filtered by email
    app.get("/order-details-seller", async (req, res) => {
      const email = req.query.email;
   
      try {
        const orders = await orderCollection.find().toArray();

        const filteredOrders = [];

        for (const order of orders) {
          const filteredItems = [];

          for (const item of order.medicineItem) {
            // Get the medicine details
            const medicine = await medicineCollection.findOne({
              _id: new ObjectId(item.medicineId),
            });

            Object.assign(item, {
              quantity: item.quantity,
              itemName: medicine.itemName,
              email: medicine.email,
              totalPrice: medicine.perUnitPrice * item.quantity,
            });

            if (medicine.email === email) {
              filteredItems.push(item);
            }
          }

          if (filteredItems.length > 0) {
            filteredOrders.push({ ...order, medicineItem: filteredItems });
          }
        }

        res.send(filteredOrders);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch orders", error });
      }
    });

    // Get order details
    app.get("/order-details", verifyToken, async (req, res) => {
      const { email } = req.query;

      let query = {};
      if (email) {
        query = { buyer: email };
      }

      try {
        const orders = await orderCollection.find(query).toArray();

        for (const order of orders) {
          for (const item of order.medicineItem) {
            // Get the medicine details
            const medicine = await medicineCollection.findOne({
              _id: new ObjectId(item.medicineId),
            });

            // Add additional details to the item
            Object.assign(item, {
              quantity: item.quantity,
              itemName: medicine.itemName,
              email: medicine.email,
              totalPrice: medicine.perUnitPrice * item.quantity,
            });
          }
        }

        res.send(orders);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch orders", error });
      }
    });

    // get all orders
    app.get("/orders", async (req, res) => {
      const result = await orderCollection.find().toArray();
      res.send(result);
    });

    // orders status update
    app.patch("/orders/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const result = await orderCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: status } }
      );
      res.send(result);
    });

    // Create payment intent endpoint
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { amount } = req.body;

        if (!amount || amount <= 0) {
          return res.status(400).json({ error: "Invalid payment amount" });
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount),
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.status(200).json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // Save payment details to order collection
    app.post("/orders", verifyToken, async (req, res) => {
      try {
        const orderDetails = req.body;

        const {
          buyer,
          totalAmount,
          paymentStatus,
          transactionId,
          medicineItem,
          status,
        } = orderDetails;

        if (
          !buyer ||
          !totalAmount ||
          !paymentStatus ||
          !transactionId ||
          !medicineItem ||
          status === undefined
        ) {
          return res
            .status(400)
            .json({ success: false, message: "Missing required fields" });
        }

        const result = await orderCollection.insertOne({
          buyer,
          totalAmount,
          paymentStatus,
          transactionId,
          medicineItem,
          status,
          orderDate: new Date(),
        });

        res.status(201).json({
          success: true,
          orderId: result.insertedId,
        });
      } catch (error) {
        console.error("Error saving order details:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Medicine Selling Server..");
});

app.listen(port, () => {
  console.log(`Medicine Selling is running on port ${port}`);
});
