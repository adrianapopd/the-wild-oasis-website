"use server";

import { revalidatePath } from "next/cache";
import { auth, signIn, signOut } from "./auth";
import { supabase } from "./supabase";
import { getBookings } from "./data-service";
import { redirect } from "next/navigation";

export async function updateGuest(formData) {
  // console.log(formData);

  const session = await auth();
  if (!session) throw new Error("You must be logged in"); //will be catched by closest error boundary(global here)
  const nationalID = formData.get("nationalID");
  const [nationality, countryFlag] = formData.get("nationality").split("%");

  if (!/^[a-zA-Z0-9]{6,12}$/.test(nationalID))
    throw new Error("Please provide a valid national ID.");

  const updateData = { nationality, countryFlag, nationalID };
  // console.log(updateData);

  const { data, error } = await supabase
    .from("guests")
    .update(updateData)
    .eq("id", session.user.guestId);

  if (error) {
    throw new Error("Guest could not be updated");
  }
  revalidatePath("/account/profile");
}

export async function deleteBooking(bookingId) {
  //check is user is authorized to delete reserv=is logged in
  const session = await auth();
  if (!session) throw new Error("You must be logged in");

  const guestBookings = await getBookings(session.user.guestId);
  //all the Ids of all bookings that this guest has
  const guestBookingIds = guestBookings.map((booking) => booking.id);
  if (!guestBookingIds.includes(bookingId))
    throw new Error("You are not allowed to delete this booking.");

  const { error } = await supabase
    .from("bookings")
    .delete()
    .eq("id", bookingId);

  if (error) {
    console.error(error);
    throw new Error("Booking could not be deleted");
  }
  revalidatePath("/account/reservations");
}

export async function updateReservation(formData) {
  // console.log(formData);

  const reservationId = Number(formData.get("reservationId"));
  // Authentication
  //check is user is logged in to have a session
  const session = await auth();
  if (!session) throw new Error("You must be logged in");

  //2. Authorization
  const guestBookings = await getBookings(session.user.guestId);
  //all the Ids of all bookings that this guest has
  const guestBookingIds = guestBookings.map((booking) => booking.id);
  if (!guestBookingIds.includes(reservationId))
    throw new Error("You are not allowed to update this booking.");

  // 3. Build update data
  const updateData = {
    numGuests: Number(formData.get("numGuests")),
    observations: formData.get("observations").slice(0, 1000),
  };

  // 4. Mutation
  const { data, error } = await supabase
    .from("bookings")
    .update(updateData)
    .eq("id", reservationId)
    .select()
    .single();

  // 5. Error handling
  if (error) {
    console.error(error);
    throw new Error("Booking could not be updated");
  }

  // 6. Revalidate cache
  revalidatePath(`/account/reservations/edit/${reservationId}`);
  revalidatePath("/account/reservations");
  // 7. Redirecting
  redirect("/account/reservations");
}

export async function createBooking(bookingData, formData) {
  // console.log(formData);
  const session = await auth();
  if (!session) throw new Error("You must be logged in");

  const newBooking = {
    ...bookingData,
    guestId: session.user.guestId,
    numGuests: Number(formData.get("numGuests")),
    observations: formData.get("observations").slice(0, 1000),
    extrasPrice: 0,
    totalPrice: bookingData.cabinPrice,
    isPaid: false,
    hasBreakfast: false,
    status: "unconfirmed",
  };
  console.log(newBooking);

  //!check if no one else booked this dates for this cabin!, not only from ui disabled booked for this cabin by this user only!

  const { error } = await supabase.from("bookings").insert([newBooking]);

  if (error) {
    throw new Error("Booking could not be created");
  }

  revalidatePath(`/cabins/${bookingData.cabinId}`);
  redirect("/cabins/thankyou");
}

export async function signInAction() {
  await signIn("google", { redirectTo: "/account" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
