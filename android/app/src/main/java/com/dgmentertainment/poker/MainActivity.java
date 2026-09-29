package com.dgmentertainment.poker;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RateTheChainReviewPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
