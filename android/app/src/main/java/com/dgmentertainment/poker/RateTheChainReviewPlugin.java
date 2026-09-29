package com.dgmentertainment.poker;

import androidx.appcompat.app.AppCompatActivity;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;
import com.google.android.gms.tasks.Task;

@CapacitorPlugin(name = "RateTheChainReview")
public class RateTheChainReviewPlugin extends Plugin {
    private static final String STORE_LISTING_URI =
        "market://details?id=com.dgmentertainment.poker";

    @PluginMethod
    public void requestReview(PluginCall call) {
        AppCompatActivity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            resolveUnavailable(call, "no-foreground-activity");
            return;
        }

        try {
            ReviewManager manager = ReviewManagerFactory.create(getContext());
            manager.requestReviewFlow().addOnCompleteListener(requestTask -> {
                if (!requestTask.isSuccessful()) {
                    resolveError(call, "REVIEW_REQUEST_FAILED", requestTask.getException());
                    return;
                }

                ReviewInfo reviewInfo = requestTask.getResult();
                if (activity.isFinishing() || activity.isDestroyed()) {
                    resolveUnavailable(call, "no-foreground-activity");
                    return;
                }
                Task<Void> flowTask = manager.launchReviewFlow(activity, reviewInfo);
                flowTask.addOnCompleteListener(flow -> {
                    if (flow.isSuccessful()) {
                        JSObject result = new JSObject();
                        result.put("status", "success");
                        result.put("requestCompleted", true);
                        call.resolve(result);
                    } else {
                        resolveError(call, "REVIEW_FLOW_FAILED", flow.getException());
                    }
                });
            });
        } catch (Exception error) {
            resolveError(call, "REVIEW_REQUEST_EXCEPTION", error);
        }
    }

    @PluginMethod
    public void openStoreListing(PluginCall call) {
        AppCompatActivity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            resolveUnavailable(call, "no-foreground-activity");
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(STORE_LISTING_URI));
            activity.startActivity(intent);
            JSObject result = new JSObject();
            result.put("status", "success");
            result.put("opened", true);
            call.resolve(result);
        } catch (ActivityNotFoundException error) {
            resolveUnavailable(call, "store-app-unavailable");
        } catch (Exception error) {
            resolveError(call, "STORE_LISTING_OPEN_FAILED", error);
        }
    }

    private void resolveUnavailable(PluginCall call, String reason) {
        JSObject result = new JSObject();
        result.put("status", "unavailable");
        result.put("reason", reason);
        call.resolve(result);
    }

    private void resolveError(PluginCall call, String code, Exception error) {
        JSObject result = new JSObject();
        result.put("status", "error");
        result.put("code", code);
        String message = error == null ? null : error.getMessage();
        result.put(
            "message",
            message == null ? "The in-app review request failed." : message
        );
        call.resolve(result);
    }
}